# Real Seedance generation verification

## Result

**Status: create attempt failed; no task ID or task record was observed.**

The live check invoked the Ark client exactly once for the official Volcengine create-task endpoint. The local adapter returned a creation-failure classification without a task ID, and a subsequent list query reported zero tasks. Task polling, result playback, usage reconciliation, and artifact capture therefore could not be completed. The provider-specific cause remains unknown, and the implementation does not claim a successful end-to-end generation.

## Verification context

- Date: 2026-07-17 (Asia/Shanghai, UTC+08:00)
- Official API documentation reviewed: 2026-07-17
- Model: `doubao-seedance-2-0-260128`
- Prompt: `镜头沿木栈道缓慢向前移动，树叶随微风轻轻摇曳`
- Input: one public, non-human reference image; its source URL is intentionally omitted
- Generation settings: adaptive ratio, 720p, 5 seconds, one task, silent audio, no last frame, no watermark, 172800-second execution expiry, priority 0
- Retry policy: no automatic retry
- Delete policy: the real DELETE endpoint was not called

The reviewed lifecycle endpoints were create, get, list, and delete. The implementation also accounts for the documented seven-day task-query window and 24-hour result-URL lifetime.

## No-cost gates before the live action

- Full automated suite: 15 files, 407 tests passed
- ESLint: passed with zero warnings
- Production build: passed
- Production dependency audit: zero known vulnerabilities
- Secret scan: passed
- Built-output secret scan: passed
- Tracked-artifact and environment-file checks: passed
- API conformance inventory: four endpoints present with referenced tests
- Dry-run: `realReady` was true, exactly one image and one request were present, and the final paid button described one 720p / 5-second / silent task
- Browser console before the live action: zero errors and zero warnings

## Observed sequence

1. The first local confirmation submission was rejected with local code `40901` because its five-minute, single-use confirmation token expired while awaiting action-time approval.
2. Source inspection and existing regression coverage confirmed that this rejection occurs before `arkClient.createTask`, so it did not call Ark.
3. After explicit recovery approval, a fresh no-cost Dry-run token was issued and the full request was revalidated.
4. The real generation button was clicked once for the recovery attempt, and the local adapter invoked the Ark client once for the official create-task endpoint.
5. The local API returned code `50201` (`Ark 创建任务失败`). No task ID, partial task ID, usage, or result URL was returned.
6. No retry was attempted.
7. A subsequent no-cost list query succeeded and returned a total of zero tasks for the current seven-day query window.

Because no task ID was issued, there is no masked task identifier to publish. The get-task endpoint could not be exercised against this attempt, and there was no task record to cancel or delete.

## Result artifacts and billing evidence

- Terminal task status: not applicable; task creation failed
- Generated video: none
- Temporary video URL: none
- Last-frame URL: none
- Usage tokens: not returned
- Local MP4 artifact: none
- SHA-256: not applicable
- Billing: not independently verified; no successful task or usage record was returned

## Finding closed after the live check

The live create failure exposed a frontend observability defect: create failures were emitted as unhandled Vue event rejections and were not shown in the page. The follow-up fix adds a page-level rejection boundary, distinguishes an expired local confirmation from the fixed local Ark-creation-failure classification, closes an invalid preview, and deliberately discards all provider-controlled code/message, request-ID, task-ID, and raw-error fields. The page maps only trusted local response classifications to fixed user-facing messages. Regression tests cover adversarial URLs, authorization and credential payloads, malformed quoting, Unicode variants, oversized text, and a 10,000-prefix authorization flood.

Post-fix validation passed 15 files and 437 tests, ESLint with zero warnings, and `git diff --check`.

## Remaining operator check

The pre-fix UI did not retain the provider-specific error code/message from this one allowed Ark attempt, and the no-retry policy prevents another create request solely to recover that diagnostic. Before a future separately authorized live attempt, verify in the Volcengine console that the Seedance 2.0 model is enabled and that the account satisfies the model's balance or resource-package eligibility requirement. This is a recommended check, not a confirmed diagnosis of the rejection.

This report intentionally excludes the API key, full task IDs, the reference-image URL, request IDs, and any temporary media URL.
