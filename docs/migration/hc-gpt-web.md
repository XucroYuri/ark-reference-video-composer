# hc-gpt-web Migration Guide

## Required Phases

1. Copy `src/view/videoGeneration/` and `src/api/videoGeneration.js`.
2. Register `/video-generation` in the existing Hash Router/dynamic menu.
3. Delete the prototype `src/utils/request.js`; imports resolve to hc-gpt-web's existing wrapper.
4. Reuse existing Element Plus, Pinia, Tiptap, Axios, SCSS, and upload infrastructure.
5. Port `/videoGeneration/*` DTOs into hc-gpt-server Gin router/api/service layers without changing frontend payloads.
6. Connect model selection to existing aiModels/modelProvider data.
7. Run the copied serializer/component tests before enabling real generation.

No Tiptap or Element Plus version upgrade is required for this migration path.

## Compatibility Matrix

| Prototype file | hc-gpt-web target | Migration note |
| --- | --- | --- |
| `src/view/videoGeneration/index.vue` | same path or feature module route | Uses Vue 3 JavaScript SFC and Pinia setup store. |
| `src/view/videoGeneration/components/*.vue` | same component directory | Uses Element Plus and `@element-plus/icons-vue`; no private prototype-only UI dependency. |
| `src/view/videoGeneration/editor/*.js` | same editor directory | Tiptap extensions are pure frontend modules. |
| `src/view/videoGeneration/utils/requestBuilder.js` | same utils directory or shared client/server package | Pure serializer; keep tests when moving. |
| `src/view/videoGeneration/store/index.js` | same store directory | Uses existing Pinia patterns and `{ code, data, msg }` API envelopes. |
| `src/api/videoGeneration.js` | `hc-gpt-web/src/api/videoGeneration.js` | Delete prototype request wrapper and use hc-gpt-web's `@/utils/request`. |
| `server/routes/videoGeneration.js` | `hc-gpt-server` Gin router/api/service | Preserve request/response DTOs and route names. |
| `server/media/store.js` | hc-gpt-server upload/media service | Replace local disk storage with existing upload infrastructure. |
| `server/security/confirmationStore.js` | hc-gpt-server cache/store | Keep five-minute single-use confirmation semantics. |
| `.env.example` | deployment/env docs | Keep secrets server-only; never add `VITE_ARK_API_KEY`. |

## Frontend Routing

Register the route as a Hash Router page:

```js
{
  path: '/video-generation',
  name: 'VideoGeneration',
  component: () => import('@/view/videoGeneration/index.vue'),
}
```

If hc-gpt-web uses a dynamic menu table, add the same route there. Do not clone Ark navigation, gallery, history, or authentication surfaces.

## API DTO Boundary

Keep frontend payloads stable:

- `uploadReference(formData)`
- `deleteReference({ mediaId })`
- `dryRunVideoGeneration({ doc, mediaList, config })`
- `createVideoGenerationTask({ doc, mediaList, config, confirmationToken })`
- `getVideoGenerationTask({ taskId })`
- `deleteVideoGenerationTask({ taskId })`

All responses should keep the hc-gpt envelope:

```js
{ code: 0, data: {}, msg: '操作成功' }
```

## Server Porting Notes

Port `/videoGeneration/*` into Gin without changing frontend payloads. The server must remain authoritative for uploaded media metadata and public URLs. Dry-run should never call Ark. Real create should:

- require `APP_REAL_GENERATION_ENABLED=true`
- require server-only `ARK_API_KEY`
- require a current single-use confirmation token
- create count tasks sequentially
- never retry task creation automatically
- return partial task IDs if Ark returns a partial failure

## Model Integration

The prototype uses `ARK_MODEL=doubao-seedance-2-0-260128`. In hc-gpt-web, connect this to existing `aiModels`/`modelProvider` data so the composer does not hard-code future model choices in the UI.

## Test Gate

Before enabling real generation in hc-gpt-web:

```bash
npm run test -- src/view/videoGeneration/__tests__
npm run lint
npm run build
```

Then run one Dry-run with uploaded media and inspect the request preview. Do not perform a paid task until the user confirms the exact task count, duration, resolution, and audio setting at action time.
