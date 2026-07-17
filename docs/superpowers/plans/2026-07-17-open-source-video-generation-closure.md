# Seedance 2.0 Open-Source Video Generation Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a secure MIT-licensed Vue 3 reference implementation that completes the Seedance 2.0 reference-image workflow across remote media registration, Dry-run, guarded task creation, polling, history, cancellation/deletion, and one authorized real-generation verification.

**Architecture:** Keep the existing Vue 3 + Pinia + Tiptap frontend and Express reference adapter in one repository. Put the selected Seedance 2.0 contract in a shared pure-JavaScript module, keep media and credentials authoritative on the server, map all four official Ark lifecycle endpoints in `server/ark/client.js`, and expose them through the existing `{ code, data, msg }` envelope.

**Tech Stack:** Vue 3.3 JavaScript SFC, Pinia, Tiptap 2, Element Plus, Axios, Vite, Express 4, Sharp, Vitest 4, Vue Test Utils, happy-dom, GitHub Actions.

## Global Constraints

- Official API baseline: the four Volcengine documents reviewed and approved on 2026-07-17 in `docs/superpowers/specs/2026-07-17-open-source-video-generation-closure-design.md`.
- Selected capability: Seedance 2.0 text-to-video plus 1–9 reference images; reference video, reference audio, Draft, callback, web search, human-asset authorization, authentication, billing, database, and TOS persistence stay out of scope.
- Default model: `doubao-seedance-2-0-260128`.
- Ark Base URL: exactly `https://ark.cn-beijing.volces.com/api/v3`.
- Never expose `ARK_API_KEY` through a `VITE_` variable, response body, log, fixture, screenshot, report, Git history, or CI artifact.
- The server must not fetch a registered remote media URL; Ark performs remote-media reachability and content validation.
- Dry-run must make zero Ark calls.
- Real creation requires the server switch, server key, authoritative media, current Dry-run, and one-time confirmation token.
- Never automatically retry task creation. If a multi-create stops partway through, return the already-created task IDs and create no compensation requests.
- Ark running states: `queued`, `running`. Ark terminal states: `succeeded`, `failed`, `cancelled`, `expired`.
- List filters may send `queued`, `running`, `cancelled`, `succeeded`, or `failed`; `expired` may appear in responses but must not be sent as `filter.status`.
- Result records are queryable for 7 days; `video_url` and `last_frame_url` are valid for 24 hours.
- The real validation is exactly one 720p, 5-second, silent task after all no-cost gates pass. Ask for immediate confirmation at the paid-action checkpoint, do not create a second task, and do not DELETE the real task.
- License: MIT. Documentation: English `README.md` plus `README.zh-CN.md`. Public target: `XucroYuri/ark-reference-video-composer`.

---

## File Structure

### New files

- `src/view/videoGeneration/domain/arkVideoContract.js` — one shared source of truth for selected Seedance 2.0 config values, defaults, validation, and Ark option projection.
- `src/view/videoGeneration/domain/__tests__/arkVideoContract.spec.js` — boundary tests for every shared config field and unsupported-field omission.
- `server/media/remoteUrl.js` — pure HTTPS remote-media URL normalization and rejection policy; performs no network access.
- `server/media/__tests__/remoteUrl.spec.js` — adversarial URL tests, including credential, local host, IP, control-character, port, and length cases.
- `src/view/videoGeneration/components/RemoteReferenceForm.vue` — focused URL-entry component; it does not own media state.
- `src/view/videoGeneration/components/TaskHistoryFilters.vue` — focused paging/filter controls for Ark task history.
- `scripts/check-secrets.mjs` — scans tracked files for non-empty credentials and bearer secrets without reading ignored `.env.local`.
- `scripts/capture-real-result.mjs` — retrieves one succeeded task through the local adapter and streams its temporary MP4 to an ignored path without logging the task ID or media URL.
- `tests/captureRealResult.spec.js` — verifies capture status/URL/content-type/size guards and redacted output with mocked requests only.
- `docs/api-conformance.md` — public mapping from the four official Ark endpoints to local adapter/client/tests.
- `README.zh-CN.md` — Chinese public project guide migrated from the current README and updated for the completed lifecycle.
- `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` — public repository policy files.
- `.github/workflows/ci.yml` — clean-install, runtime audit, secret scan, test, lint, and production-build workflow.
- `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/pull_request_template.md` — contributor intake templates.
- `docs/verification/real-generation.md` — public, redacted evidence created only after the authorized real task reaches a terminal state.

### Existing files to modify

- `src/view/videoGeneration/utils/requestBuilder.js` — consume the shared contract, enforce 1–9 image content, and project only supported Ark fields.
- `server/routes/videoGeneration.js` — consume shared validation; register remote references; list tasks; preserve safe upstream status.
- `server/media/store.js` — enforce official local-image boundaries and persist both upload and remote URL records.
- `server/ark/client.js` — implement collection GET and exact repeated query keys.
- `src/api/videoGeneration.js` — add remote reference, list, and task-action adapters.
- `src/view/videoGeneration/store/index.js` — shared defaults, remote media, `expired`, history, cancellation/deletion, and bounded query failure behavior.
- `src/view/videoGeneration/components/ReferenceMediaPanel.vue` — compose upload and remote URL entry.
- `src/view/videoGeneration/components/GenerationOptionsBar.vue` — all selected model values and advanced options.
- `src/view/videoGeneration/components/GenerationTaskPanel.vue` — task detail, usage, expiry, actions, and history.
- `src/view/videoGeneration/components/RequestPreviewDrawer.vue` — validation provenance, cost disclaimer, and full request preview.
- `src/view/videoGeneration/index.vue` — connect new store actions and task-panel events.
- `src/view/videoGeneration/styles/index.scss` — responsive URL form, advanced options, filters, task actions, and result metadata.
- `package.json` — public metadata and secret-check script.
- `.gitignore` — ignore `artifacts/` and verification runtime outputs.
- `.env.example` — clarify that `PUBLIC_MEDIA_BASE_URL` is optional when using a remote URL.
- `README.md`, `docs/开发者交接说明.md`, `docs/migration/hc-gpt-web.md`, `design-qa.md` — public English guide, local handoff, migration map, and browser evidence.
- Existing Vitest files under `server/__tests__/`, `src/api/__tests__/`, and `src/view/videoGeneration/__tests__/` — regression and lifecycle coverage.

---

### Task 1: Shared Seedance 2.0 Contract and Request Projection

**Files:**
- Create: `src/view/videoGeneration/domain/arkVideoContract.js`
- Create: `src/view/videoGeneration/domain/__tests__/arkVideoContract.spec.js`
- Modify: `src/view/videoGeneration/utils/requestBuilder.js:1-307`
- Modify: `src/view/videoGeneration/__tests__/requestBuilder.spec.js:1-489`
- Modify: `server/routes/videoGeneration.js:21-244`
- Modify: `server/__tests__/dryRun.spec.js:1-413`

**Interfaces:**
- Produces: `DEFAULT_GENERATION_CONFIG`, `ARK_RATIOS`, `ARK_RESOLUTIONS`, `ARK_LIST_FILTER_STATUSES`, `validateGenerationConfig(value)`, and `pickArkRequestOptions(config)`.
- `validateGenerationConfig(value)` returns `{ value, errors }`, where `value` is a normalized complete config when `errors.length === 0`.
- `pickArkRequestOptions(config)` returns only `ratio`, `resolution`, `duration`, `generate_audio`, `return_last_frame`, `watermark`, `execution_expires_after`, and `priority`.

- [ ] **Step 1: Write the failing shared-contract tests**

```js
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GENERATION_CONFIG,
  pickArkRequestOptions,
  validateGenerationConfig,
} from '../arkVideoContract.js'

describe('selected Seedance 2.0 contract', () => {
  it.each(['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'])(
    'accepts ratio %s',
    (ratio) => expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      ratio,
    }).errors).toEqual([]),
  )

  it.each([480, 720, 1080])('rejects numeric resolution %s', (resolution) => {
    expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      resolution,
    }).errors).toContainEqual(expect.objectContaining({ path: 'config.resolution' }))
  })

  it.each([4, 5, 15, -1])('accepts duration %s', (duration) => {
    expect(validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      duration,
    }).errors).toEqual([])
  })

  it('projects supported fields and omits unsupported fields', () => {
    expect(pickArkRequestOptions({
      ...DEFAULT_GENERATION_CONFIG,
      frames: 57,
      seed: 1,
      serviceTier: 'flex',
    })).toEqual({
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      generate_audio: true,
      return_last_frame: false,
      watermark: false,
      execution_expires_after: 172800,
      priority: 0,
    })
  })
})
```

- [ ] **Step 2: Run the new tests and verify the module is missing**

Run: `npx vitest --run src/view/videoGeneration/domain/__tests__/arkVideoContract.spec.js`

Expected: FAIL with `Failed to resolve import "../arkVideoContract.js"`.

- [ ] **Step 3: Implement the shared contract**

```js
export const ARK_RATIOS = Object.freeze([
  'adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9',
])
export const ARK_RESOLUTIONS = Object.freeze(['480p', '720p', '1080p', '4k'])
export const ARK_LIST_FILTER_STATUSES = Object.freeze([
  'queued', 'running', 'cancelled', 'succeeded', 'failed',
])

export const DEFAULT_GENERATION_CONFIG = Object.freeze({
  mode: 'reference_media',
  ratio: 'adaptive',
  resolution: '720p',
  duration: 5,
  count: 1,
  generateAudio: true,
  returnLastFrame: false,
  watermark: false,
  executionExpiresAfter: 172800,
  priority: 0,
})

export function validateGenerationConfig(input) {
  const errors = []
  const add = (path, message) => errors.push({ path, message })
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { value: null, errors: [{ path: 'config', message: '必须是对象' }] }
  }
  if (input.mode !== 'reference_media') add('config.mode', '仅支持 reference_media')
  if (!ARK_RATIOS.includes(input.ratio)) add('config.ratio', '比例不受支持')
  if (!ARK_RESOLUTIONS.includes(input.resolution)) add('config.resolution', '分辨率不受支持')
  if (!(input.duration === -1 || (Number.isInteger(input.duration)
    && input.duration >= 4 && input.duration <= 15))) {
    add('config.duration', '时长必须为 -1 或 4 到 15 的整数')
  }
  if (!(Number.isInteger(input.count) && input.count >= 1 && input.count <= 4)) {
    add('config.count', '数量必须是 1 到 4 的整数')
  }
  if (typeof input.generateAudio !== 'boolean') add('config.generateAudio', '必须是布尔值')
  if (typeof input.returnLastFrame !== 'boolean') add('config.returnLastFrame', '必须是布尔值')
  if (typeof input.watermark !== 'boolean') add('config.watermark', '必须是布尔值')
  if (!(Number.isInteger(input.executionExpiresAfter)
    && input.executionExpiresAfter >= 3600
    && input.executionExpiresAfter <= 259200)) {
    add('config.executionExpiresAfter', '必须是 3600 到 259200 的整数')
  }
  if (!(Number.isInteger(input.priority) && input.priority >= 0 && input.priority <= 9)) {
    add('config.priority', '必须是 0 到 9 的整数')
  }
  return { value: errors.length ? null : { ...input }, errors }
}

export function pickArkRequestOptions(config) {
  return {
    ratio: config.ratio,
    resolution: config.resolution,
    duration: config.duration,
    generate_audio: config.generateAudio,
    return_last_frame: config.returnLastFrame,
    watermark: config.watermark,
    execution_expires_after: config.executionExpiresAfter,
    priority: config.priority,
  }
}
```

- [ ] **Step 4: Wire request building and server validation to the shared contract**

In `requestBuilder.js`, import `pickArkRequestOptions` and replace the five hard-coded option fields with:

```js
return {
  model,
  content: [
    ...(serialization.modelPrompt.trim()
      ? [{ type: 'text', text: serialization.modelPrompt }]
      : []),
    ...serialization.media.map((item) => ({
      type: 'image_url',
      role: 'reference_image',
      image_url: { url: item.url },
    })),
  ],
  ...pickArkRequestOptions(config),
}
```

Add a `REFERENCE_IMAGE_COUNT` blocker when `serialization.media.length > 9`, and reject zero content only when both text and media are absent. In `server/routes/videoGeneration.js`, replace local ratio/resolution/duration sets and `validateGenerationConfig` with the shared function, preserving the existing `{ reason: 'INVALID_CONFIG', errors }` error shape.

- [ ] **Step 5: Update request and route boundary tests**

Add exact assertions that 4:3, 3:4, 21:9, 480p, 4k, durations 4/15/-1, and advanced values are accepted; durations 3/16, 10 images, unsupported fields, and malformed advanced values are rejected before any Ark call.

Run: `npx vitest --run src/view/videoGeneration/domain/__tests__/arkVideoContract.spec.js src/view/videoGeneration/__tests__/requestBuilder.spec.js server/__tests__/dryRun.spec.js`

Expected: 3 test files pass and no test performs an Ark request.

- [ ] **Step 6: Commit the shared contract**

```bash
git add src/view/videoGeneration/domain src/view/videoGeneration/utils/requestBuilder.js \
  src/view/videoGeneration/__tests__/requestBuilder.spec.js \
  server/routes/videoGeneration.js server/__tests__/dryRun.spec.js
git commit -m "feat: align requests with Seedance 2.0 contract"
```

---

### Task 2: Complete Generation Options in Store and UI

**Files:**
- Modify: `src/view/videoGeneration/store/index.js:1-608`
- Modify: `src/view/videoGeneration/components/GenerationOptionsBar.vue:1-92`
- Modify: `src/view/videoGeneration/components/RequestPreviewDrawer.vue:1-99`
- Modify: `src/view/videoGeneration/__tests__/store.spec.js:1-1255`
- Modify: `src/view/videoGeneration/__tests__/composer.spec.js:1-277`

**Interfaces:**
- Consumes: `DEFAULT_GENERATION_CONFIG` and `validateGenerationConfig` from Task 1.
- Produces: a store `config` containing all ten shared fields and a complete preview request whose advanced options exactly match the current draft.

- [ ] **Step 1: Write failing store and component tests**

```js
it('accepts the complete selected Seedance 2.0 config', () => {
  const store = useVideoGenerationStore()
  store.setConfig({
    ratio: '21:9',
    resolution: '4k',
    duration: -1,
    generateAudio: false,
    returnLastFrame: true,
    watermark: true,
    executionExpiresAfter: 3600,
    priority: 9,
  })
  expect(store.config).toMatchObject({
    ratio: '21:9', resolution: '4k', duration: -1,
    generateAudio: false, returnLastFrame: true, watermark: true,
    executionExpiresAfter: 3600, priority: 9,
  })
})
```

Mount `GenerationOptionsBar`, select `4:3`, `480p`, `15`, turn on last frame and watermark, set timeout `3600`, set priority `9`, and assert the emitted patches use numbers and booleans rather than strings.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npx vitest --run src/view/videoGeneration/__tests__/store.spec.js src/view/videoGeneration/__tests__/composer.spec.js -t "complete selected Seedance|advanced generation options"`

Expected: FAIL because the current store rejects the new keys and the component has no advanced controls.

- [ ] **Step 3: Replace duplicated store defaults and validators**

```js
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
} from '../domain/arkVideoContract.js'

const createDefaultConfig = () => ({ ...DEFAULT_GENERATION_CONFIG })
const CONFIG_KEYS = Object.keys(DEFAULT_GENERATION_CONFIG)

function assertConfigPatch(current, patch) {
  const next = { ...current, ...patch }
  const { errors } = validateGenerationConfig(next)
  if (errors.length) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_INVALID_CONFIG',
      '视频生成参数无效',
      { errors },
    )
  }
  return next
}
```

Have `setConfig(patch)` reject unknown keys, call `assertConfigPatch`, and assign only supplied keys. Keep Dry-run invalidation behavior unchanged.

- [ ] **Step 4: Render complete normal and advanced controls**

Use shared arrays for ratio and resolution options. Render duration values `-1` and `4` through `15`. Add a `<details class="generation-advanced-options">` containing:

```vue
<label><input type="checkbox" :checked="config.returnLastFrame" @change="update('returnLastFrame', $event.target.checked)">返回尾帧</label>
<label><input type="checkbox" :checked="config.watermark" @change="update('watermark', $event.target.checked)">AI 水印</label>
<label>任务超时<input data-testid="expires-input" type="number" min="3600" max="259200" :value="config.executionExpiresAfter" @change="update('executionExpiresAfter', Number($event.target.value))"></label>
<label>优先级<input data-testid="priority-input" type="number" min="0" max="9" :value="config.priority" @change="update('priority', Number($event.target.value))"></label>
```

Replace the hard-coded token price in the page/preview with `实际费用以方舟控制台为准` and show `count` as the exact number of independent tasks to be created.

- [ ] **Step 5: Run store and component suites**

Run: `npx vitest --run src/view/videoGeneration/__tests__/store.spec.js src/view/videoGeneration/__tests__/composer.spec.js`

Expected: both files pass; all Dry-run DTO assertions include the new default fields.

- [ ] **Step 6: Commit generation options**

```bash
git add src/view/videoGeneration/store/index.js \
  src/view/videoGeneration/components/GenerationOptionsBar.vue \
  src/view/videoGeneration/components/RequestPreviewDrawer.vue \
  src/view/videoGeneration/__tests__/store.spec.js \
  src/view/videoGeneration/__tests__/composer.spec.js
git commit -m "feat: expose complete Seedance generation options"
```

---

### Task 3: Official Local Image Boundaries and Remote URL Registry

**Files:**
- Create: `server/media/remoteUrl.js`
- Create: `server/media/__tests__/remoteUrl.spec.js`
- Modify: `server/media/store.js:1-404`
- Modify: `server/__tests__/media.spec.js:1-410`

**Interfaces:**
- Produces: `normalizeRemoteMediaUrl(rawUrl): string` and `RemoteMediaUrlError`.
- Extends `createMediaStore()` with `registerRemote({ url, name })` while preserving `save`, `get`, `list`, `remove`, and `read`.
- Stored records have `source: 'upload' | 'remote_url'`; old index records without `source` migrate to `source: 'upload'`.

- [ ] **Step 1: Write failing adversarial URL tests**

```js
it.each([
  'http://images.example.test/a.png',
  'https://user:pass@images.example.test/a.png',
  'https://localhost/a.png',
  'https://service.local/a.png',
  'https://127.0.0.1/a.png',
  'https://[::1]/a.png',
  'https://images.example.test:444/a.png',
  `https://images.example.test/${'a'.repeat(4096)}`,
])('rejects remote media URL %s', (value) => {
  expect(() => normalizeRemoteMediaUrl(value)).toThrow(RemoteMediaUrlError)
})

it('normalizes a public HTTPS URL without fetching it', () => {
  expect(normalizeRemoteMediaUrl('https://images.example.test/a%20b.png')).toBe(
    'https://images.example.test/a%20b.png',
  )
})
```

- [ ] **Step 2: Run the URL tests and verify the module is missing**

Run: `npx vitest --run server/media/__tests__/remoteUrl.spec.js`

Expected: FAIL with an import-resolution error.

- [ ] **Step 3: Implement the no-fetch URL policy**

```js
import { isIP } from 'node:net'

export class RemoteMediaUrlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RemoteMediaUrlError'
    this.code = code
  }
}

export function normalizeRemoteMediaUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl || rawUrl.length > 2048 || rawUrl.trim() !== rawUrl) {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 格式无效')
  }
  if (/\p{Cc}/u.test(rawUrl)) {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 包含控制字符')
  }
  let parsed
  try { parsed = new URL(rawUrl) } catch {
    throw new RemoteMediaUrlError('INVALID_REMOTE_MEDIA_URL', '公网图片 URL 格式无效')
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.port || !host || host === 'localhost'
    || host.endsWith('.localhost') || host.endsWith('.local') || isIP(host)) {
    throw new RemoteMediaUrlError('REMOTE_MEDIA_URL_NOT_PUBLIC', '只允许公开 HTTPS 图片 URL')
  }
  parsed.hash = ''
  return parsed.toString()
}
```

- [ ] **Step 4: Write failing media-store boundary and persistence tests**

Add Sharp-generated fixtures at 299×300, 300×300, 6000×2400, 6001×2400, ratio 0.39, ratio 2.51, and exactly 30 MB. Add a store restart test proving a remote record persists, returns the same `remoteUrl`, and `remove()` never calls `unlink()` for that record.

- [ ] **Step 5: Enforce official dimensions and support mixed records**

Change `validateDecodableImage` to return `{ width, height }`. Reject width/height outside 300–6000, ratio outside 0.4–2.5, and `buffer.length >= maxBytes`. Store `source`, `width`, and `height` for uploads.

Implement:

```js
async function registerRemote({ url, name }) {
  let remoteUrl
  try {
    remoteUrl = normalizeRemoteMediaUrl(url)
  } catch (error) {
    if (error instanceof RemoteMediaUrlError) {
      throw new MediaStoreError(error.code, error.message)
    }
    throw error
  }
  return enqueueMutation(async () => {
    const id = idFactory()
    assertMediaId(id)
    const record = {
      id,
      source: 'remote_url',
      kind: 'image',
      name: safeOriginalName(name || new URL(remoteUrl).pathname, `remote-${id}`),
      previewUrl: remoteUrl,
      remoteUrl,
      status: 'ready',
    }
    mediaById.set(id, record)
    await persistIndex()
    return { ...record }
  })
}
```

Import `RemoteMediaUrlError` with `normalizeRemoteMediaUrl`. Update hydration, removal, and reading so upload records require a filename while remote records never touch the filesystem. The error translation above is required so the Task 4 route returns a bounded 400 envelope rather than passing malformed user input to the generic 500 handler.

- [ ] **Step 6: Run media security tests**

Run: `npx vitest --run server/media/__tests__/remoteUrl.spec.js server/__tests__/media.spec.js`

Expected: both files pass; no remote URL test invokes `fetch`, `http`, or `https` request APIs.

- [ ] **Step 7: Commit media policy**

```bash
git add server/media/remoteUrl.js server/media/__tests__/remoteUrl.spec.js \
  server/media/store.js server/__tests__/media.spec.js
git commit -m "feat: register public reference image URLs safely"
```

---

### Task 4: Remote Reference End-to-End Frontend Flow

**Files:**
- Create: `src/view/videoGeneration/components/RemoteReferenceForm.vue`
- Modify: `server/routes/videoGeneration.js:246-403`
- Modify: `src/api/videoGeneration.js:1-48`
- Modify: `src/view/videoGeneration/store/index.js:1-608`
- Modify: `src/view/videoGeneration/components/ReferenceMediaPanel.vue:1-144`
- Modify: `src/view/videoGeneration/index.vue:1-161`
- Modify: `src/view/videoGeneration/styles/index.scss`
- Modify: `server/__tests__/media.spec.js`
- Modify: `src/api/__tests__/videoGeneration.spec.js:1-88`
- Modify: `src/view/videoGeneration/__tests__/store.spec.js`
- Modify: `src/view/videoGeneration/__tests__/composer.spec.js`

**Interfaces:**
- Consumes: `mediaStore.registerRemote({ url, name })` from Task 3.
- Produces: `registerRemoteReference(data)` API adapter and `store.addRemoteMedia({ url, name })`.
- `RemoteReferenceForm` emits `submit` with `{ url, name }` and receives `pending` plus `errorMessage`.

- [ ] **Step 1: Write failing server and API-adapter tests**

```js
it('registers a remote reference through the authoritative media store', async () => {
  mediaStore.registerRemote.mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
    source: 'remote_url', kind: 'image', name: 'Boardwalk',
    previewUrl: 'https://images.example.test/boardwalk.jpg',
    remoteUrl: 'https://images.example.test/boardwalk.jpg', status: 'ready',
  })
  const result = await postJson(baseUrl, 'registerRemoteReference', {
    url: 'https://images.example.test/boardwalk.jpg', name: 'Boardwalk',
  })
  expect(result.response.status).toBe(200)
  expect(mediaStore.registerRemote).toHaveBeenCalledWith({
    url: 'https://images.example.test/boardwalk.jpg', name: 'Boardwalk',
  })
})
```

Assert the frontend adapter sends POST `/videoGeneration/registerRemoteReference` with the supplied object.

- [ ] **Step 2: Run focused tests and verify missing routes/functions**

Run: `npx vitest --run server/__tests__/media.spec.js src/api/__tests__/videoGeneration.spec.js -t "remote reference"`

Expected: FAIL because the route and adapter export do not exist.

- [ ] **Step 3: Implement the route, adapter, and store action**

Server route:

```js
router.post('/registerRemoteReference', async (req, res, next) => {
  try {
    const media = await mediaStore.registerRemote({
      url: req.body?.url,
      name: req.body?.name,
    })
    return ok(res, media, '公网参考素材登记成功')
  } catch (error) {
    if (error instanceof MediaStoreError) {
      return fail(res, 40009, error.message, { reason: error.code })
    }
    return next(error)
  }
})
```

Frontend adapter and store action:

```js
export const registerRemoteReference = (data) => service({
  url: '/videoGeneration/registerRemoteReference',
  method: 'post', data, validateStatus: resolveServerEnvelope,
})

async function addRemoteMedia(input) {
  if (uploadPending.value || removePending.value || submitPending.value) throwPending()
  uploadPending.value = true
  try {
    const data = requireMedia(await unwrapApiCall(registerRemoteReference(input)))
    return addMedia(data)
  } finally {
    uploadPending.value = false
  }
}
```

- [ ] **Step 4: Build the focused URL form and compose it into the panel**

`RemoteReferenceForm.vue` must render URL and optional name fields, disable submission while pending, emit one normalized object, and clear only after the parent promise resolves. Add `referrerpolicy="no-referrer"` to remote thumbnails. Keep upload behavior unchanged.

```vue
<form class="remote-reference-form" @submit.prevent="$emit('submit', { url: url.trim(), name: name.trim() })">
  <label>公网图片 URL<input v-model="url" type="url" required maxlength="2048" placeholder="https://example.com/reference.png"></label>
  <label>显示名称<input v-model="name" maxlength="255" placeholder="可选"></label>
  <button type="submit" :disabled="pending || !url.trim()">添加 URL 素材</button>
</form>
```

- [ ] **Step 5: Add component/store tests for URL → mention → Dry-run**

Mock the remote-register envelope, submit the form, assert `图片1` appears, call `PromptComposer.insertMedia`, and assert Dry-run sends only `{ id, realIndex }` for the media while the server request preview contains the authoritative `remoteUrl`.

Run: `npx vitest --run server/__tests__/media.spec.js src/api/__tests__/videoGeneration.spec.js src/view/videoGeneration/__tests__/store.spec.js src/view/videoGeneration/__tests__/composer.spec.js`

Expected: all four files pass.

- [ ] **Step 6: Commit the remote reference vertical slice**

```bash
git add server/routes/videoGeneration.js server/__tests__/media.spec.js \
  src/api/videoGeneration.js src/api/__tests__/videoGeneration.spec.js \
  src/view/videoGeneration/store/index.js src/view/videoGeneration/components/RemoteReferenceForm.vue \
  src/view/videoGeneration/components/ReferenceMediaPanel.vue src/view/videoGeneration/index.vue \
  src/view/videoGeneration/styles/index.scss src/view/videoGeneration/__tests__/store.spec.js \
  src/view/videoGeneration/__tests__/composer.spec.js
git commit -m "feat: add remote reference image workflow"
```

---

### Task 5: Ark Task List and Safe Upstream Error Semantics

**Files:**
- Modify: `server/ark/client.js:1-227`
- Modify: `server/routes/videoGeneration.js:1-403`
- Modify: `src/api/videoGeneration.js:1-48`
- Modify: `server/__tests__/realGeneration.spec.js:1-1146`
- Modify: `src/api/__tests__/videoGeneration.spec.js:1-88`

**Interfaces:**
- Produces: `arkClient.listTasks(filters)`, local GET `/videoGeneration/listTasks`, and frontend `listVideoGenerationTasks(params)`.
- `listTasks` accepts `{ pageNum, pageSize, status, taskIds, model, serviceTier }` and returns Ark `{ items, total }` unchanged after sanitization.
- The local query contract is `pageNum`, `pageSize`, `status`, repeated `taskId`, `model`, and `serviceTier`; only the Ark client translates these names to the official dotted query keys.

- [ ] **Step 1: Write failing Ark client tests for exact collection queries**

```js
it('lists tasks with repeated task-id filters', async () => {
  fetchImpl.mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), {
    status: 200, headers: { 'content-type': 'application/json' },
  }))
  await client.listTasks({
    pageNum: 2, pageSize: 20, status: 'failed',
    taskIds: ['task-1', 'task-2'], model: 'ep-1', serviceTier: 'default',
  })
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks?page_num=2&page_size=20&filter.status=failed&filter.task_ids=task-1&filter.task_ids=task-2&filter.model=ep-1&filter.service_tier=default',
    expect.objectContaining({ method: 'GET' }),
  )
})
```

Add rejection cases for page 0/501, page size 0/501, `expired` as a filter, invalid task IDs, non-scalar model input, and service tiers outside `default`/`flex`. Do not invent an undocumented maximum number of `filter.task_ids`; preserve every valid repeated ID supplied by the caller.

- [ ] **Step 2: Run focused tests and verify `listTasks` is missing**

Run: `npx vitest --run server/__tests__/realGeneration.spec.js -t "lists tasks"`

Expected: FAIL with `client.listTasks is not a function`.

- [ ] **Step 3: Implement exact query construction**

```js
function buildTaskListPath({ pageNum = 1, pageSize = 20, status, taskIds = [], model, serviceTier } = {}) {
  if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > 500) throwInvalidList('page_num')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throwInvalidList('page_size')
  if (status && !ARK_LIST_FILTER_STATUSES.includes(status)) throwInvalidList('filter.status')
  if (!Array.isArray(taskIds)) throwInvalidList('filter.task_ids')
  if (model != null && (typeof model !== 'string' || !model.trim())) throwInvalidList('filter.model')
  if (serviceTier != null && !['default', 'flex'].includes(serviceTier)) {
    throwInvalidList('filter.service_tier')
  }
  const query = new URLSearchParams({ page_num: String(pageNum), page_size: String(pageSize) })
  if (status) query.set('filter.status', status)
  for (const taskId of taskIds) {
    assertTaskId(taskId)
    query.append('filter.task_ids', taskId)
  }
  if (model) query.set('filter.model', model)
  if (serviceTier) query.set('filter.service_tier', serviceTier)
  return `/contents/generations/tasks?${query}`
}
```

Expose `listTasks(filters)` using GET and no request body.

- [ ] **Step 4: Preserve safe upstream HTTP status in local routes**

Create one helper used by create/get/list/delete routes:

```js
function failArkRequest(res, localCode, message, error, apiKey) {
  const normalized = normalizeArkError(error, apiKey)
  const status = normalized.status >= 400 && normalized.status <= 599
    ? normalized.status : 502
  return fail(res, localCode, message, { error: normalized }, status)
}
```

Add GET `/listTasks`, validate local query values before Ark, and use `failArkRequest` for 400/401/403/404/429/5xx without exposing response text or credentials. Parse repeated local task IDs exactly:

```js
const rawTaskIds = req.query.taskId
const taskIds = rawTaskIds == null
  ? []
  : Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds]
const pageNum = req.query.pageNum == null ? 1 : Number(req.query.pageNum)
const pageSize = req.query.pageSize == null ? 20 : Number(req.query.pageSize)
const data = await arkClient.listTasks({
  pageNum,
  pageSize,
  status: req.query.status,
  taskIds,
  model: req.query.model,
  serviceTier: req.query.serviceTier,
})
```

Reject array values for every scalar query field and rely on `arkClient.listTasks` for the documented integer/range/status/task-ID checks.

- [ ] **Step 5: Add the frontend list adapter and exact adapter tests**

```js
export function listVideoGenerationTasks({
  pageNum = 1,
  pageSize = 20,
  status,
  taskIds = [],
  model,
  serviceTier,
} = {}) {
  const params = new URLSearchParams({
    pageNum: String(pageNum),
    pageSize: String(pageSize),
  })
  if (status) params.set('status', status)
  for (const taskId of taskIds) params.append('taskId', taskId)
  if (model) params.set('model', model)
  if (serviceTier) params.set('serviceTier', serviceTier)
  return service({
    url: '/videoGeneration/listTasks', method: 'get', params,
    donNotShowLoading: true, validateStatus: resolveServerEnvelope,
  })
}
```

Run: `npx vitest --run server/__tests__/realGeneration.spec.js src/api/__tests__/videoGeneration.spec.js`

Expected: both files pass, including 429 preservation and repeated `filter.task_ids`.

- [ ] **Step 6: Commit lifecycle API coverage**

```bash
git add server/ark/client.js server/routes/videoGeneration.js \
  server/__tests__/realGeneration.spec.js src/api/videoGeneration.js \
  src/api/__tests__/videoGeneration.spec.js
git commit -m "feat: complete Ark task lifecycle APIs"
```

---

### Task 6: Pinia Task History, Expired State, and DELETE Actions

**Files:**
- Modify: `src/view/videoGeneration/store/index.js:1-608`
- Modify: `src/view/videoGeneration/__tests__/store.spec.js:1-1255`

**Interfaces:**
- Consumes: `listVideoGenerationTasks`, `deleteVideoGenerationTask`, and `getVideoGenerationTask`.
- Produces: `taskQuery`, `taskTotal`, `taskListPending`, `taskActionPending`, `loadTaskHistory(patch)`, and `removeOrCancelTask(task)`.
- Uses local display-only status `unavailable`; never sends it to Ark.

- [ ] **Step 1: Write failing `expired` and history tests**

```js
it('accepts expired as an Ark terminal state and stops polling', async () => {
  videoGenerationApi.getVideoGenerationTask.mockResolvedValue({
    code: 0, data: { id: 'task-expired', status: 'expired' }, msg: 'ok',
  })
  store.resumeTask('task-expired')
  await vi.advanceTimersByTimeAsync(3000)
  expect(store.taskList).toContainEqual(expect.objectContaining({
    id: 'task-expired', status: 'expired',
  }))
  await vi.advanceTimersByTimeAsync(3000)
  expect(videoGenerationApi.getVideoGenerationTask).toHaveBeenCalledTimes(1)
})

it('loads and merges paged task history', async () => {
  videoGenerationApi.listVideoGenerationTasks.mockResolvedValue({
    code: 0, data: { items: [{ id: 'task-1', status: 'succeeded', content: { video_url: 'https://cdn.test/a.mp4' } }], total: 1 }, msg: 'ok',
  })
  await store.loadTaskHistory({ pageNum: 1, pageSize: 20, status: 'succeeded' })
  expect(store.taskTotal).toBe(1)
  expect(store.taskList[0].id).toBe('task-1')
})
```

- [ ] **Step 2: Write failing DELETE matrix tests**

For queued, assert one delete call and local status `cancelled`. For succeeded/failed/expired, assert one delete call and removal from the list. For running/cancelled, assert `VIDEO_GENERATION_TASK_ACTION_NOT_ALLOWED` and zero delete calls. Add a race case where Ark rejects DELETE with 409/400, then one `getTask` refreshes the real state.

- [ ] **Step 3: Run focused store tests and verify failures**

Run: `npx vitest --run src/view/videoGeneration/__tests__/store.spec.js -t "expired|task history|DELETE matrix"`

Expected: FAIL because `expired`, history state, and task actions are absent.

- [ ] **Step 4: Implement task-state sets and history merge**

```js
const ARK_TASK_STATUSES = new Set([
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired',
])
const TERMINAL_TASK_STATUSES = new Set([
  'succeeded', 'failed', 'cancelled', 'expired',
])

function mergeTasks(current, incoming) {
  const byId = new Map(current.map((task) => [task.id, task]))
  for (const task of incoming) byId.set(task.id, { ...byId.get(task.id), ...task })
  return [...byId.values()].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
}
```

Implement `loadTaskHistory` with validated page/filter values, `{ items, total }` shape checks, and no automatic call on store creation.

- [ ] **Step 5: Implement state-aware DELETE and bounded query failure**

```js
async function removeOrCancelTask(task) {
  if (!task || !['queued', 'succeeded', 'failed', 'expired'].includes(task.status)) {
    throw new VideoGenerationStoreError(
      'VIDEO_GENERATION_TASK_ACTION_NOT_ALLOWED',
      '当前任务状态不支持取消或删除',
    )
  }
  const originalStatus = task.status
  await unwrapApiCall(deleteVideoGenerationTask({ taskId: task.id }))
  if (originalStatus === 'queued') {
    upsertTask({ ...task, status: 'cancelled' })
  } else {
    taskList.value = taskList.value.filter((item) => item.id !== task.id)
  }
}
```

When query returns a definitive 400/401/403/404, stop polling. Use `unavailable` only for a no-longer-queryable known task; keep transient network/5xx behavior on the existing bounded schedule.

- [ ] **Step 6: Run the complete store suite**

Run: `npx vitest --run src/view/videoGeneration/__tests__/store.spec.js`

Expected: the store test file passes, including stale-response and no-create-retry regression cases.

- [ ] **Step 7: Commit task state management**

```bash
git add src/view/videoGeneration/store/index.js src/view/videoGeneration/__tests__/store.spec.js
git commit -m "feat: manage task history and terminal states"
```

---

### Task 7: Complete Task History and Result UI

**Files:**
- Create: `src/view/videoGeneration/components/TaskHistoryFilters.vue`
- Modify: `src/view/videoGeneration/components/GenerationTaskPanel.vue:1-47`
- Modify: `src/view/videoGeneration/index.vue:1-161`
- Modify: `src/view/videoGeneration/styles/index.scss`
- Modify: `src/view/videoGeneration/__tests__/composer.spec.js:1-277`

**Interfaces:**
- Consumes: Task 6 store state/actions.
- `TaskHistoryFilters` emits `load` with `{ pageNum, pageSize, status, taskIds, model, serviceTier }`.
- `GenerationTaskPanel` emits `refresh-history`, `refresh-task`, and `remove-or-cancel` and never calls APIs directly.

- [ ] **Step 1: Write failing component tests for all official states and actions**

Mount the panel with queued, running, succeeded, failed, cancelled, expired, and unavailable tasks. Assert:

```js
expect(wrapper.text()).toContain('任务超时')
expect(wrapper.text()).toContain('OutputVideoSensitiveContentDetected')
expect(wrapper.text()).toContain('视频链接有效期为 24 小时')
expect(wrapper.find('[data-task-id="task-queued"] [data-action="delete"]').text()).toBe('取消任务')
expect(wrapper.find('[data-task-id="task-succeeded"] [data-action="delete"]').text()).toBe('删除记录')
expect(wrapper.find('[data-task-id="task-running"] [data-action="delete"]').exists()).toBe(false)
```

Assert succeeded task metadata renders `usage.completion_tokens`, `content.video_url`, optional `content.last_frame_url`, resolution, ratio, duration, and `generate_audio`.

- [ ] **Step 2: Run the component test and verify failures**

Run: `npx vitest --run src/view/videoGeneration/__tests__/composer.spec.js -t "official task states|task history filters"`

Expected: FAIL because the current panel only renders a status string and video.

- [ ] **Step 3: Implement focused history filters**

Render status select values from `ARK_LIST_FILTER_STATUSES`, comma/newline task-ID input normalized to an array, optional model input, service-tier values `default`/`flex`, page size 20/50/100, previous/next controls, and an explicit “加载历史” button. Do not offer `expired` in the status select.

- [ ] **Step 4: Implement the detailed task panel**

Use official fields without renaming them:

```vue
<p v-if="task.status === 'failed'" role="alert">
  <strong>{{ task.error?.code || '生成失败' }}</strong>
  <span>{{ task.error?.message || '方舟未返回错误详情' }}</span>
</p>
<p v-if="task.status === 'expired'" role="status">任务超时，已停止生成。</p>
<video v-if="task.status === 'succeeded' && task.content?.video_url" :src="task.content.video_url" controls playsinline preload="metadata" />
<a v-if="task.content?.video_url" :href="task.content.video_url" target="_blank" rel="noopener noreferrer">打开或下载视频</a>
<img v-if="task.content?.last_frame_url" :src="task.content.last_frame_url" alt="生成视频尾帧" referrerpolicy="no-referrer">
<p v-if="task.status === 'succeeded'">视频与尾帧链接有效期为 24 小时，请及时下载或转存。</p>
```

Mask the displayed task ID while preserving the full value in internal event payloads and accessible copy control. Never include `video_url` in component error text.

- [ ] **Step 5: Connect page events to the store**

```vue
<GenerationTaskPanel
  :task-list="store.taskList"
  :total="store.taskTotal"
  :loading="store.taskListPending"
  :action-pending="store.taskActionPending"
  @refresh-history="store.loadTaskHistory"
  @refresh-task="store.pollTask"
  @remove-or-cancel="store.removeOrCancelTask"
/>
```

Catch action errors in the page and render a local alert instead of allowing an unhandled promise rejection.

- [ ] **Step 6: Add responsive styles and run component tests**

At widths below 640 px, make filters single-column, task metadata wrap, video width 100%, and action buttons remain at least 40 px high.

Run: `npx vitest --run src/view/videoGeneration/__tests__/composer.spec.js`

Expected: the component test file passes with no console warnings.

- [ ] **Step 7: Commit task UI**

```bash
git add src/view/videoGeneration/components/TaskHistoryFilters.vue \
  src/view/videoGeneration/components/GenerationTaskPanel.vue \
  src/view/videoGeneration/index.vue src/view/videoGeneration/styles/index.scss \
  src/view/videoGeneration/__tests__/composer.spec.js
git commit -m "feat: complete video task history UI"
```

---

### Task 8: Public Repository Materials and CI

**Files:**
- Create: `LICENSE`
- Create: `README.zh-CN.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `scripts/check-secrets.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/pull_request_template.md`
- Create: `docs/api-conformance.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `docs/开发者交接说明.md`
- Modify: `docs/migration/hc-gpt-web.md`
- Modify: `tests/scaffold.spec.js`

**Interfaces:**
- Produces: `npm run check:secrets` and public documentation that never requires reading the internal handoff files.
- CI must run on pushes and pull requests to `main` with Node 22 and `npm ci`.

- [ ] **Step 1: Write failing scaffold expectations**

```js
it.each([
  'LICENSE', 'README.md', 'README.zh-CN.md', 'CONTRIBUTING.md',
  'SECURITY.md', 'CODE_OF_CONDUCT.md', '.github/workflows/ci.yml',
  'docs/api-conformance.md',
])('includes public repository file %s', (path) => {
  expect(existsSync(resolve(rootDir, path))).toBe(true)
})

it('declares MIT public repository metadata', () => {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
  expect(pkg.private).not.toBe(true)
  expect(pkg.license).toBe('MIT')
  expect(pkg.repository.url).toContain('XucroYuri/ark-reference-video-composer')
})
```

- [ ] **Step 2: Run scaffold tests and verify missing public files**

Run: `npx vitest --run tests/scaffold.spec.js`

Expected: FAIL listing the missing public repository files.

- [ ] **Step 3: Add package metadata and MIT license**

Set:

```json
{
  "name": "ark-reference-video-composer",
  "version": "0.1.0",
  "description": "Vue 3 reference implementation for guarded Seedance video generation with atomic media mentions.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/XucroYuri/ark-reference-video-composer.git"
  },
  "homepage": "https://github.com/XucroYuri/ark-reference-video-composer#readme",
  "bugs": { "url": "https://github.com/XucroYuri/ark-reference-video-composer/issues" },
  "keywords": ["vue", "seedance", "video-generation", "tiptap", "volcengine"],
  "files": [
    "src", "server", "scripts", "docs", "index.html",
    "vite.config.js", "vitest.config.js", "vitest.setup.js"
  ],
  "engines": { "node": ">=22" }
}
```

Remove `private: true` but state in both READMEs that no npm package is published. Add MIT text with `Copyright (c) 2026 XucroYuri`.

- [ ] **Step 4: Write bilingual public guides and policies**

English `README.md` and Chinese `README.zh-CN.md` must contain the same sections: What it demonstrates, Safety and cost boundary, Architecture, Quick start, Remote URL workflow, Local upload workflow, Dry-run versus real generation, Environment variables, API lifecycle, Testing, Known limitations, Migration, Security, Contributing, License.

Use exact quick-start commands:

```bash
npm install
cp .env.example .env.local
npm run serve
```

State that `APP_REAL_GENERATION_ENABLED=false` is the default, `ARK_API_KEY` is server-only, URL media is not pre-fetched, real use costs money, and result URLs expire after 24 hours. `SECURITY.md` directs private reports through GitHub Private Vulnerability Reporting and explicitly says not to publish credentials in an issue. `CODE_OF_CONDUCT.md` defines respectful collaboration, no harassment, no credential sharing, and maintainer enforcement contact through repository moderation tools.

- [ ] **Step 5: Add the API conformance matrix**

For each official endpoint, list official method/path, Ark client method, local adapter route, frontend adapter, store consumer, test file, relevant states/filters, and implemented scope. Include links to the four official documents and date `2026-07-17`. Explicitly distinguish omitted optional fields from unsupported fields.

- [ ] **Step 6: Add tracked-file secret scanning**

`scripts/check-secrets.mjs` must obtain tracked files via `git ls-files -z`, skip binary files and `.env.example`, and fail on non-empty assignments to `ARK_API_KEY`, names beginning `VITE_ARK_`, or unredacted `Authorization: Bearer` values. It must never open `.env.local` because that file is not in `git ls-files`.

Add:

```json
"check:secrets": "node scripts/check-secrets.mjs"
```

Add `artifacts/` to `.gitignore`.

- [ ] **Step 7: Add GitHub Actions**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm audit --omit=dev
      - run: npm run check:secrets
      - run: npm run test
      - run: npm run lint
      - run: npm run build
```

- [ ] **Step 8: Run documentation/scaffold and secret checks**

Run: `npx vitest --run tests/scaffold.spec.js && npm run check:secrets`

Expected: scaffold tests pass and secret scan prints a success summary without printing any secret values.

- [ ] **Step 9: Commit open-source materials**

```bash
git add LICENSE README.md README.zh-CN.md CONTRIBUTING.md SECURITY.md \
  CODE_OF_CONDUCT.md package.json package-lock.json .gitignore .env.example \
  scripts/check-secrets.mjs .github docs/api-conformance.md \
  docs/开发者交接说明.md docs/migration/hc-gpt-web.md tests/scaffold.spec.js
git commit -m "docs: prepare the project for open source"
```

---

### Task 9: Full Automated Conformance and Security Gate

**Files:**
- Modify: any test file needed to close uncovered rows in `docs/api-conformance.md`
- Modify: `docs/api-conformance.md` only when an automated test path changes

**Interfaces:**
- Produces: a zero-cost, deterministic proof that all four official API mappings and project security gates pass before browser or paid validation.

- [ ] **Step 1: Run the post-change test suite**

Run: `npm run test`

Expected: all test files pass. Record the exact file/test count for the final handoff; do not reuse the old 12-file/227-test baseline as final evidence.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint && npm run build`

Expected: ESLint exits 0 with zero warnings and Vite creates `dist/` without a `VITE_ARK_API_KEY`, `.env.local`, `qaMedia` production branch, or server credential.

- [ ] **Step 3: Run dependency and secret gates**

Run: `npm audit --omit=dev && npm run check:secrets`

Expected: both commands exit 0. If audit reports a runtime vulnerability, update only the affected dependency, rerun the relevant tests, and commit the lockfile change as `fix: update vulnerable runtime dependency` before continuing.

- [ ] **Step 4: Inspect exact built and tracked surfaces**

Run:

```bash
rg -n "ARK_API_KEY|VITE_ARK|Authorization: Bearer" dist README.md README.zh-CN.md docs .github || true
git status --short
git diff --check
```

Expected: no unredacted credential value, clean formatting, and no unintended working-tree file. Documentation may contain the literal variable name `ARK_API_KEY` but no non-empty assignment.

- [ ] **Step 5: Commit any conformance-test-only corrections**

If Step 1–4 required test or documentation corrections:

```bash
git add server/__tests__ src/api/__tests__ src/view/videoGeneration/__tests__ tests docs/api-conformance.md package-lock.json
git commit -m "test: close video API conformance gaps"
```

If no files changed, do not create an empty commit.

---

### Task 10: Browser Dry-Run and Responsive QA

**Files:**
- Modify: `design-qa.md`
- Create: `docs/design-references/open-source-composer-desktop.png`
- Create: `docs/design-references/open-source-composer-mobile.png`

**Interfaces:**
- Consumes: the fully tested local application.
- Produces: no-cost browser evidence with no Ark task creation.

- [ ] **Step 1: Start the application with real generation disabled**

Run:

```bash
APP_REAL_GENERATION_ENABLED=false VITE_CLI_PORT=43127 VITE_SERVER_PORT=43128 npm run serve
```

Expected: frontend at `http://127.0.0.1:43127/#/video-generation`, health endpoint at `http://127.0.0.1:43128/api/health`, and no Ark request.

- [ ] **Step 2: Exercise the remote-reference Dry-run flow in a browser**

Use the Browser skill. Register:

```text
https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/1280px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg
```

Insert `@图片1`, use prompt `镜头沿木栈道缓慢向前移动，树叶随微风轻轻摇曳`, choose adaptive / 720p / 5 seconds / 1 task / silent, and open Dry-run preview. Assert request content contains one `text` item followed by one `image_url` item with `role: reference_image`.

- [ ] **Step 3: Verify no-cost blockers and lifecycle controls**

Confirm the real button is disabled because the process switch is false, task history loads only after an explicit click, malformed URL errors are visible, and browser console has zero errors. Confirm no POST to `/createTask` occurred.

- [ ] **Step 4: Capture desktop and mobile evidence**

Capture 1440×1000 and 390×844 screenshots after the URL reference is added and Dry-run preview is available. Check no horizontal overflow, task filters remain usable, advanced controls fit, and action buttons remain reachable.

- [ ] **Step 5: Update `design-qa.md` and commit QA evidence**

Record viewport, tested flow, request shape, console result, no-cost assertion, screenshot paths, and `final result: passed`.

```bash
git add design-qa.md docs/design-references/open-source-composer-desktop.png \
  docs/design-references/open-source-composer-mobile.png
git commit -m "test: verify the open-source composer in browser"
```

---

### Task 11: One Authorized Real Generation and Redacted Evidence

**Files:**
- Create: `scripts/capture-real-result.mjs`
- Create: `tests/captureRealResult.spec.js`
- Create after success/terminal result: `docs/verification/real-generation.md`
- Runtime-only ignored files: `artifacts/real-generation/`

**Interfaces:**
- Consumes: ignored `.env.local` containing a non-empty `ARK_API_KEY`; runtime environment overrides the real-generation switch.
- Produces: one Ark task at most, one local ignored result file when succeeded, and one public redacted report.
- `captureRealResult({ taskId, baseUrl, outputPath, fetchImpl, maxBytes = 512 * 1024 * 1024 })` calls the local get-task route, requires `succeeded` plus a public HTTPS `content.video_url`, rejects redirects and oversized responses, streams to a temporary file, atomically renames it, and returns only `{ bytes, sha256 }`.

- [ ] **Step 1: Write failing capture-helper tests with mocked network responses**

Cover a succeeded envelope and MP4 stream, non-succeeded task, non-public or non-HTTPS URL, redirect, non-`video/mp4` content type, declared oversized body, streamed body crossing an injected eight-byte `maxBytes`, and partial-file cleanup. In the success case, assert the returned object contains only `bytes` and `sha256`; capture stdout/stderr and assert neither the full task ID nor media URL appears.

Run: `npx vitest --run tests/captureRealResult.spec.js`

Expected: FAIL because `scripts/capture-real-result.mjs` does not exist.

- [ ] **Step 2: Implement the bounded, redacted capture helper**

Use `fs/promises.open`, a `ReadableStream` reader, and `createHash('sha256')` so the response is never buffered as one unbounded value. Write to `${outputPath}.partial`, count each chunk before writing it, reject once the cumulative count exceeds `maxBytes`, close the handle in `finally`, remove the partial file on every failure, and rename only after a complete successful stream. The exported function defaults `maxBytes` to 512 MiB; tests inject a small limit. Request the task through:

```js
const taskResponse = await fetchImpl(
  `${baseUrl}/api/videoGeneration/getTask?taskId=${encodeURIComponent(taskId)}`,
)
```

Require the local envelope to have HTTP success, `code === 0`, `data.status === 'succeeded'`, and a `data.content.video_url` accepted by Task 3's no-fetch public-HTTPS normalizer. Fetch that URL with `{ redirect: 'error' }`; require HTTP success and normalized content type `video/mp4` (parameters may follow). The CLI entrypoint requires non-empty `ARK_TASK_ID`, defaults `ARK_LOCAL_BASE_URL` to `http://127.0.0.1:43128`, defaults the output to `artifacts/real-generation/result.mp4`, fixes the production limit at 512 MiB, and prints only `JSON.stringify({ bytes, sha256 })`.

Run: `npx vitest --run tests/captureRealResult.spec.js`

Expected: all capture-helper tests pass without real network access.

- [ ] **Step 3: Commit the tested capture helper**

```bash
git add scripts/capture-real-result.mjs tests/captureRealResult.spec.js
git commit -m "test: add redacted real-result capture helper"
```

- [ ] **Step 4: Preflight without creating a task**

Verify only booleans, never values:

```bash
node --input-type=module -e "import { loadEnvironment, loadConfig } from './server/config.js'; const c=loadConfig(loadEnvironment({rootDir:process.cwd()})); console.log(JSON.stringify({key:Boolean(c.arkApiKey),model:c.arkModel,base:c.arkBaseUrl}))"
```

Expected: `key` is true, model is `doubao-seedance-2-0-260128`, and base is the exact official URL. Run the full automated gate from Task 9 once more before starting the real-enabled process.

- [ ] **Step 5: Start a real-enabled temporary process**

Run:

```bash
APP_REAL_GENERATION_ENABLED=true VITE_CLI_PORT=43127 VITE_SERVER_PORT=43128 npm run serve
```

Expected: health succeeds; `.env.local` remains unmodified and untracked.

- [ ] **Step 6: Reproduce the final request through the real frontend**

Use the same public non-human boardwalk image and prompt from Task 10. Set adaptive, 720p, 5 seconds, count 1, audio false, last frame false, watermark false, timeout 172800, priority 0. Open Dry-run preview and verify `realReady: true`, one image, and exactly one task.

- [ ] **Step 7: Paid-action checkpoint — request immediate confirmation**

Ask exactly:

```text
所有无成本门禁已通过，当前预览将创建 1 个 Seedance 2.0 任务：720p、5 秒、无声，不自动重试。是否现在执行这一次付费调用？
```

Do not press the real-generation button until the user answers yes at this checkpoint.

- [ ] **Step 8: Create exactly one task and poll to an official terminal state**

After confirmation, press the real-generation button once. Record timestamps and masked task ID in memory. Poll through the product UI. Do not resend create if the request times out, the response is ambiguous, or the task fails.

Expected terminal state: `succeeded`, `failed`, `cancelled`, or `expired`. A non-succeeded terminal state still produces an honest report and ends the paid test.

- [ ] **Step 9: Verify success artifacts without exposing the URL**

If succeeded, use the query and list features to verify the task is returned, `content.video_url` is HTTPS, `usage.total_tokens === usage.completion_tokens`, and the video plays. Pass the task ID only through the temporary process environment and run the tested helper; do not paste the ID into documentation or commentary:

```bash
read -r -s ARK_TASK_ID
export ARK_TASK_ID
node scripts/capture-real-result.mjs
unset ARK_TASK_ID
file artifacts/real-generation/result.mp4
shasum -a 256 artifacts/real-generation/result.mp4
wc -c artifacts/real-generation/result.mp4
```

Expected: the helper prints only byte count and SHA-256 JSON; `file` reports MP4 media; independent hash and byte-count commands agree. Do not call DELETE on the real task.

- [ ] **Step 10: Write the public redacted report**

`docs/verification/real-generation.md` must include date/timezone, official-doc review date, model, non-sensitive prompt, config, masked task ID, observed state sequence, terminal status, usage when present, local file byte count and SHA-256 when succeeded, list-recovery result, and all no-retry/no-delete assertions. It must not include the API key, full task ID, remote input URL, `video_url`, or `last_frame_url`.

- [ ] **Step 11: Run secret scan and commit only the report**

Run: `npm run check:secrets && git status --short --ignored | rg 'artifacts|real-generation'`

Expected: report is untracked before add, `artifacts/` is ignored, and secret scan passes.

```bash
git add docs/verification/real-generation.md
git commit -m "test: verify one real Seedance generation"
```

---

### Task 12: Publish the Public GitHub Repository and Verify CI

**Files:**
- No product files unless GitHub CI reveals a reproducible repository issue.

**Interfaces:**
- Consumes: clean `main`, all local gates, real-generation report, authenticated GitHub CLI account `XucroYuri`.
- Produces: public `https://github.com/XucroYuri/ark-reference-video-composer` with passing `main` CI.

- [ ] **Step 1: Verify clean final repository state**

Run:

```bash
git status --short --branch
git log --oneline -12
npm run check:secrets
npm run test
npm run lint
npm run build
```

Expected: clean `main`; all commands exit 0; ignored `.env.local`, uploads, `dist/`, and `artifacts/` are not staged.

- [ ] **Step 2: Check the public target before creation**

Run: `gh repo view XucroYuri/ark-reference-video-composer --json nameWithOwner,visibility,url`

Expected: repository-not-found. If it already exists, inspect it and stop for user direction rather than overwriting or force-pushing.

- [ ] **Step 3: Create and push the authorized public repository**

Run:

```bash
gh repo create XucroYuri/ark-reference-video-composer \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description="Secure Vue 3 reference implementation for Seedance video generation with atomic media mentions."
```

Expected: `origin` points to the new repository and `main` is pushed without force.

- [ ] **Step 4: Add discoverability metadata**

Run:

```bash
gh repo edit XucroYuri/ark-reference-video-composer \
  --add-topic vue3 \
  --add-topic seedance \
  --add-topic video-generation \
  --add-topic tiptap \
  --add-topic volcengine \
  --enable-issues
```

Expected: topics and issues are enabled; repository remains public.

- [ ] **Step 5: Wait for and verify GitHub Actions**

Run:

```bash
gh run list --repo XucroYuri/ark-reference-video-composer --workflow ci.yml --limit 1
```

Resolve that single run's numeric database ID and watch it explicitly:

```bash
CI_RUN_ID="$(gh run list \
  --repo XucroYuri/ark-reference-video-composer \
  --workflow ci.yml \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"
test -n "$CI_RUN_ID"
gh run watch "$CI_RUN_ID" \
  --repo XucroYuri/ark-reference-video-composer \
  --exit-status
unset CI_RUN_ID
```

Expected: the `ci` workflow completes successfully. If CI fails, reproduce locally, commit a focused fix, push normally, and watch the new run; never disable a gate to obtain green status.

- [ ] **Step 6: Verify public metadata and tracked safety**

Run:

```bash
gh repo view XucroYuri/ark-reference-video-composer \
  --json nameWithOwner,visibility,url,licenseInfo,defaultBranchRef,repositoryTopics
git ls-files '.env*' 'uploads/*' 'artifacts/*' 'dist/*'
```

Expected: visibility `PUBLIC`, license `MIT`, default branch `main`, expected topics, and tracked sensitive/runtime files limited to `.env.example`, `.env.development`, and `uploads/.gitkeep`.

---

## Final Completion Checklist

- [ ] Every changed product slice has passing targeted tests and an atomic commit; verification/publish-only tasks create no empty commits.
- [ ] `docs/api-conformance.md` maps create, get, list, and delete to implementation and tests.
- [ ] Post-change test count is recorded and greater than the 227-test baseline.
- [ ] Lint, production build, runtime audit, tracked-file secret scan, browser Dry-run, desktop/mobile QA, and GitHub CI pass.
- [ ] At most one real task was created, with no create retry and no real DELETE.
- [ ] The redacted report contains no full task ID or temporary media URL.
- [ ] The GitHub repository is public under MIT with bilingual documentation.
