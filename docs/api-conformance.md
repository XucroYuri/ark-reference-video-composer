# Ark video generation API conformance

Reviewed against the official Volcengine documentation on **2026-07-17**:

- [Create a video generation task](https://www.volcengine.com/docs/82379/1520757)
- [Get a video generation task](https://www.volcengine.com/docs/82379/1521309)
- [List video generation tasks](https://www.volcengine.com/docs/82379/1521675)
- [Cancel or delete a video generation task](https://www.volcengine.com/docs/82379/1521720)

“Conformant” here means that every field and lifecycle call this reference implementation actually sends follows the reviewed API. It does not claim to implement every Ark or Seedance capability.

## Four-endpoint mapping

| Official method and path | Ark client method | Local adapter route | Frontend adapter | Store consumer | Contract/behavior tests | Relevant states or filters | Implemented scope |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v3/contents/generations/tasks` | `createArkClient().createTask(payload)` in `server/ark/client.js` | `POST /api/videoGeneration/createTask` | `createVideoGenerationTask(data)` in `src/api/videoGeneration.js` | `confirmRealGeneration()` in `src/view/videoGeneration/store/index.js` | `server/__tests__/realGeneration.spec.js`; `src/api/__tests__/videoGeneration.spec.js`; `src/view/videoGeneration/__tests__/store.spec.js`; `src/view/videoGeneration/__tests__/requestBuilder.spec.js` | Creates a `queued` task; local `count` 1–4 creates independent tasks sequentially and is never sent to Ark. | Text and 1–9 `reference_image` items; selected options listed below; one-time paid confirmation; no automatic create retry or compensation; partial IDs retained on multi-create failure. |
| `GET /api/v3/contents/generations/tasks/{id}` | `createArkClient().getTask(id)` | `GET /api/videoGeneration/getTask?taskId=…` | `getVideoGenerationTask({ taskId })` | `pollTask()` and scheduled polling in `src/view/videoGeneration/store/index.js` | `server/__tests__/realGeneration.spec.js`; `src/api/__tests__/videoGeneration.spec.js`; `src/view/videoGeneration/__tests__/store.spec.js`; `src/view/videoGeneration/__tests__/composer.spec.js` | Accepts Ark `queued`, `running`, `succeeded`, `failed`, `cancelled`, `expired`; polls active states only; local `unavailable` is display-only. | Provisional `queued` display starts immediately; the first bounded GET follows the 3 s visible/10 s hidden schedule; stale-response guards, terminal stop, safe error/result/usage mapping, and 24-hour result warning are implemented. |
| `GET /api/v3/contents/generations/tasks` | `createArkClient().listTasks(filters)` | `GET /api/videoGeneration/listTasks` | `listVideoGenerationTasks(filters)` | `loadTaskHistory()` in `src/view/videoGeneration/store/index.js` | `server/__tests__/realGeneration.spec.js`; `src/api/__tests__/videoGeneration.spec.js`; `src/view/videoGeneration/__tests__/store.spec.js`; `src/view/videoGeneration/__tests__/composer.spec.js` | `page_num`/`page_size` 1–500; repeated `filter.task_ids`; exact `filter.model`; `filter.service_tier`=`default`/`flex`; status filter only `queued`, `running`, `cancelled`, `succeeded`, `failed` (not `expired`). | Called only on explicit history load/refresh; defaults to page 1 and 20 items; merges authoritative recent tasks; UI explains the seven-day query window. |
| `DELETE /api/v3/contents/generations/tasks/{id}` | `createArkClient().deleteTask(id)` | `POST /api/videoGeneration/deleteTask` | `deleteVideoGenerationTask({ taskId })` | `removeOrCancelTask()` in `src/view/videoGeneration/store/index.js` | `server/__tests__/realGeneration.spec.js`; `src/api/__tests__/videoGeneration.spec.js`; `src/view/videoGeneration/__tests__/store.spec.js`; `src/view/videoGeneration/__tests__/composer.spec.js` | `queued` is cancelled; `succeeded`, `failed`, and `expired` records can be deleted; no action is offered for `running` or `cancelled`; race rejection triggers authoritative refresh. | Encoded validated task IDs; both 204 and JSON responses; status-dependent UI; successful cancellation updates locally and successful terminal deletion removes the record. |

The Ark client uses the fixed `https://ark.cn-beijing.volces.com/api/v3` origin, server-side bearer authentication, JSON request/response handling, redirect rejection, bounded time and response size, safe upstream status preservation, request-ID propagation, and recursive sensitive-data redaction.

## Create request scope

| Category | Fields/capabilities | Treatment |
| --- | --- | --- |
| Selected and sent | `model`, ordered `content`; `ratio` = `adaptive`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `21:9`; `resolution` = `480p`, `720p`, `1080p`, `4k`; integer `duration` 4–15 or `-1`; `generate_audio`; `return_last_frame`; `watermark`; `execution_expires_after` 3600–259200; `priority` 0–9 | Validated from shared constants before request construction. Only these selected options enter the create body. |
| Local-only | `count` 1–4; `mediaId`; `realIndex`; Tiptap JSON; confirmation token | Used by the adapter for orchestration, authoritative lookup, serialization, and paid confirmation; never sent to Ark. |
| Official optional fields deliberately omitted | `callback_url`, create-time `service_tier`, `safety_identifier` | No guessed defaults are sent. Callbacks are outside this polling reference; create-time tier selection is outside the chosen flow (list filtering by service tier is implemented); a production integration may derive `safety_identifier` from a real authenticated user but this demo has no identity to supply safely. |
| Unsupported in the selected reference scope | `frames`, `seed`, `camera_fixed`, `draft`, `tools`; reference video/audio; person-asset authorization; Seedance 1.5 Draft; network search | No UI, storage, validation, or wire fields are provided. These are unsupported capabilities, not optional values silently discarded from a submitted request. |

`content` contains optional text first when present, followed by each unique image in first-mention order with `type: image_url` and `role: reference_image`. Local uploads are strongly validated. Registered HTTPS URLs are structurally validated but intentionally not fetched by the adapter; Ark remains authoritative for their reachability and media properties.

## Lifecycle and retention semantics

- Active protocol states: `queued`, `running`.
- Terminal protocol states: `succeeded`, `failed`, `cancelled`, `expired`.
- `expired` may appear in task responses, but is not a supported list status filter.
- `unavailable` is local presentation for a deleted, too-old, or definitively unqueryable task and is never sent to or persisted as an Ark state.
- List/query coverage is limited to the most recent seven days according to the reviewed documentation.
- Successful video and last-frame URLs expire after 24 hours; the UI directs users to download or transfer them promptly.
- Dry-run and remote URL registration make no Ark requests. Only confirmed task creation can incur generation cost.
