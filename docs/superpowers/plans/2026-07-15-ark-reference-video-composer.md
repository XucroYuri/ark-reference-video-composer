# Ark Reference Video Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Vue 3 MVP that faithfully reproduces Ark's reference-media video composer, including local media upload, inline `@图片N` references, deterministic Ark request serialization, default Dry-run behavior, and guarded real task submission.

**Architecture:** The frontend mirrors `hc-gpt-web`: Vue 3.3 JavaScript SFCs, Element Plus, Pinia, Axios API modules, Hash Router, Vite 4, and `{ code, data, msg }` responses. A local Express adapter makes the standalone prototype runnable; frontend routes and DTOs are intentionally shaped so the feature can later move into `hc-gpt-web` unchanged while the Express routes are ported to `hc-gpt-server` Gin.

**Tech Stack:** Vue 3.3, JavaScript + JSDoc, Vite 4, Element Plus 2, Pinia 2, Axios 1, Tiptap 2.1, Express 4, Multer, Vitest, Vue Test Utils, happy-dom, npm.

## Global Constraints

- Source page: `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`.
- Clone only the marked video composer; do not reproduce Ark navigation, authentication, gallery, history, or private BFF.
- Use JavaScript SFCs and directory conventions compatible with `/Users/huachi/Code/huachi.online/hc-gpt-web`.
- Use Tiptap `mediaMention` atomic nodes; do not implement mentions as decorated textarea text.
- Default to Dry-run. Never call Ark during unit, component, contract, browser, or visual tests.
- Never expose `ARK_API_KEY` through a `VITE_` variable, frontend response, log, snapshot, fixture, or screenshot.
- Real generation requires `APP_REAL_GENERATION_ENABLED=true`, an API key, public media URLs, a successful Dry-run, and a single-use confirmation token.
- Do not automatically retry task creation; this prevents duplicate paid tasks.
- The only permitted paid validation, after explicit action-time confirmation, is one `720p`, `5s`, `1` result, with audio disabled when the model permits it.
- Use real source screenshots and source/implementation side-by-side comparison before visual handoff.
- Preserve the trailing space in the actual project directory name: `/Users/huachi/Code/03-video-toolkit/Video-Generation-API `.

## Execution Order

Execute tasks strictly in numeric order: **Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9 → Task 10**. The document places Tasks 6–10 first for downstream interface visibility; do not begin them until Tasks 1–5 below are complete.

The installed `clone-website` skill's reconnaissance, exact computed-style extraction, component-specification, builder dispatch, and visual-QA workflow are mandatory. Its default Next.js/TypeScript scaffold is superseded by the user's approved Vue 3 JavaScript architecture and `hc-gpt-web` compatibility requirement; use `npm run build` as the compile gate.

## Downstream Tasks (Execute After Tasks 1–5)

---

### Task 6: Add the Migration-Compatible API Module and Pinia Store

**Files:**
- Create: `src/api/videoGeneration.js`
- Create: `src/view/videoGeneration/store/index.js`
- Create: `src/view/videoGeneration/__tests__/store.spec.js`

**Interfaces:**
- Consumes: `/api/videoGeneration/*` routes from Tasks 4–5 and `buildArkRequest` from Task 3.
- Produces: frontend API functions and `useVideoGenerationStore` state/actions consumed by all UI components.

- [ ] **Step 1: Write the failing store tests**

Create `src/view/videoGeneration/__tests__/store.spec.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useVideoGenerationStore } from '../store'

vi.mock('@/api/videoGeneration', () => ({
  uploadReference: vi.fn(),
  deleteReference: vi.fn(),
  dryRunVideoGeneration: vi.fn(),
  createVideoGenerationTask: vi.fn(),
  getVideoGenerationTask: vi.fn(),
  deleteVideoGenerationTask: vi.fn(),
}))

describe('useVideoGenerationStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('uses source-compatible default generation options', () => {
    const store = useVideoGenerationStore()
    expect(store.config).toEqual({
      mode: 'reference_media',
      ratio: 'adaptive',
      resolution: '720p',
      duration: 5,
      count: 1,
      generateAudio: true,
    })
  })

  it('assigns stable realIndex values and clears the complete draft', () => {
    const store = useVideoGenerationStore()
    store.addMedia({ id: 'm1', kind: 'image', name: 'a.png', status: 'ready' })
    store.addMedia({ id: 'm2', kind: 'image', name: 'b.png', status: 'ready' })
    expect(store.mediaList.map((item) => item.realIndex)).toEqual([1, 2])
    store.clearDraft()
    expect(store.mediaList).toEqual([])
    expect(store.editorDoc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})
```

- [ ] **Step 2: Run the store tests and verify failure**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/store.spec.js
```

Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement the API module in existing project style**

Create `src/api/videoGeneration.js`:

```js
import service from '@/utils/request'

export const uploadReference = (formData) => service({
  url: '/videoGeneration/uploadReference',
  method: 'post',
  data: formData,
  headers: { 'Content-Type': 'multipart/form-data' },
})

export const deleteReference = (data) => service({ url: '/videoGeneration/deleteReference', method: 'post', data })
export const dryRunVideoGeneration = (data) => service({ url: '/videoGeneration/dryRun', method: 'post', data, donNotShowLoading: true })
export const createVideoGenerationTask = (data) => service({ url: '/videoGeneration/createTask', method: 'post', data })
export const getVideoGenerationTask = (params) => service({ url: '/videoGeneration/getTask', method: 'get', params, donNotShowLoading: true })
export const deleteVideoGenerationTask = (data) => service({ url: '/videoGeneration/deleteTask', method: 'post', data })
```

- [ ] **Step 4: Implement the Pinia Setup Store**

State:

```js
const mediaList = ref([])
const editorDoc = ref({ type: 'doc', content: [{ type: 'paragraph' }] })
const config = reactive({ mode: 'reference_media', ratio: 'adaptive', resolution: '720p', duration: 5, count: 1, generateAudio: true })
const dryRunResult = ref(null)
const taskList = ref([])
const uploadPending = ref(false)
const submitPending = ref(false)
```

Actions:

```js
addMedia(media)
uploadMedia(file)
removeMedia(mediaId)
setEditorDoc(doc)
setConfig(patch)
runDryRun()
confirmRealGeneration(token)
pollTask(taskId)
clearDraft()
```

`removeMedia` updates the Tiptap JSON with a pure `removeMentionsByMediaId` helper; it never renumbers remaining `realIndex` values.

- [ ] **Step 5: Run store tests**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/store.spec.js
```

Expected: all store tests pass.

- [ ] **Step 6: Commit the frontend data layer**

Run:

```bash
git add src/api/videoGeneration.js src/view/videoGeneration/store src/view/videoGeneration/__tests__/store.spec.js
git commit -m "feat: add video generation store and API adapter"
```

---

### Task 7: Implement the Atomic Tiptap Mention Editor

**Files:**
- Create: `src/view/videoGeneration/editor/mediaMention.js`
- Create: `src/view/videoGeneration/editor/mediaSuggestion.js`
- Create: `src/view/videoGeneration/components/MediaSuggestionMenu.vue`
- Create: `src/view/videoGeneration/components/PromptComposer.vue`
- Create: `src/view/videoGeneration/__tests__/mediaMention.spec.js`

**Interfaces:**
- Consumes: `store.mediaList`, `store.editorDoc`, and `store.setEditorDoc` from Task 6.
- Produces: Tiptap `mediaMention` nodes and a controlled `PromptComposer` component that emits `update:modelValue`.

- [ ] **Step 1: Write failing atomic-node tests**

Create `src/view/videoGeneration/__tests__/mediaMention.spec.js`:

```js
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { MediaMention } from '../editor/mediaMention'

describe('MediaMention', () => {
  it('renders an atomic @ label and round-trips its attributes', () => {
    const editor = new Editor({
      extensions: [StarterKit, MediaMention],
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [
          { type: 'text', text: '让 ' },
          { type: 'mediaMention', attrs: { mediaId: 'm1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
          { type: 'text', text: ' 挥手' },
        ] }],
      },
    })
    expect(editor.getHTML()).toContain('data-media-id="m1"')
    expect(editor.getText()).toContain('@图片1')
    expect(editor.getJSON().content[0].content[1].attrs).toMatchObject({ mediaId: 'm1', realIndex: 1 })
    editor.destroy()
  })
})
```

- [ ] **Step 2: Run editor tests and verify failure**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/mediaMention.spec.js
```

Expected: FAIL because `mediaMention.js` does not exist.

- [ ] **Step 3: Implement the atomic node**

Implement `MediaMention = Node.create({ ... })` with:

```js
name: 'mediaMention'
group: 'inline'
inline: true
atom: true
selectable: true
```

Attributes: `mediaId`, `kind`, `sourceLabel`, `realIndex`. Render a `span[data-type="media-mention"]` with no inline SVG and text `@${sourceLabel}`. `renderText` returns the same label. Parse only nodes containing all required data attributes.

- [ ] **Step 4: Implement the suggestion extension**

`createMediaSuggestion({ getItems, onStateChange })` uses `@tiptap/suggestion` with `char: '@'`, inserts a `mediaMention`, and reports:

```js
{
  open: true,
  items,
  selectedIndex,
  clientRect,
  command,
}
```

When no ready media exists, return one disabled menu item labeled `请先添加参考内容`; never insert an invalid mention.

- [ ] **Step 5: Implement the Vue editor and menu**

`PromptComposer.vue` props:

```js
modelValue: { type: Object, required: true }
mediaList: { type: Array, default: () => [] }
disabled: { type: Boolean, default: false }
```

Emits:

```js
['update:modelValue', 'focus', 'blur']
```

Use `EditorContent`, `StarterKit`, `MediaMention`, and the suggestion extension. Destroy the editor in `onBeforeUnmount`. Watch external `modelValue` changes without feeding the editor's own transaction back into `setContent`.

Implement keyboard behavior:

```text
ArrowDown: next item
ArrowUp: previous item
Enter: insert selected item
Escape: close menu
Mouse click: insert clicked item
```

When no ready media exists, render `请先添加参考内容` and do not run an insert command. Use `<editor-content :editor="editor" />` and emit the declared `update:modelValue` event on each document-changing transaction. On store media removal, delete every mention whose `mediaId` is absent. Expose `focus`, `insertMedia`, and `clear` through `defineExpose`.

Do not serialize to plain text inside the editor component; Task 3's pure builder remains the sole serialization path.

- [ ] **Step 6: Run editor tests and add IME/paste cases**

Add component tests that type Chinese text around a mention, paste plain text, reject pasted unknown media HTML, and select a suggestion by keyboard.

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/mediaMention.spec.js
```

Expected: all node, keyboard, composition, paste, and atomic delete tests pass.

- [ ] **Step 7: Commit the editor**

Run:

```bash
git add src/view/videoGeneration/editor src/view/videoGeneration/components/MediaSuggestionMenu.vue src/view/videoGeneration/components/PromptComposer.vue src/view/videoGeneration/__tests__/mediaMention.spec.js
git commit -m "feat: add inline media mention editor"
```

---

### Task 8: Build and Assemble the Faithful Composer UI

**Files:**
- Create: `src/view/videoGeneration/components/ReferenceMediaPanel.vue`
- Create: `src/view/videoGeneration/components/GenerationOptionsBar.vue`
- Create: `src/view/videoGeneration/components/RequestPreviewDrawer.vue`
- Create: `src/view/videoGeneration/components/GenerationTaskPanel.vue`
- Create: `src/view/videoGeneration/styles/index.scss`
- Modify: `src/view/videoGeneration/index.vue`
- Create: `src/view/videoGeneration/__tests__/composer.spec.js`

**Interfaces:**
- Consumes: source component spec from Task 1, store from Task 6, editor from Task 7, and API results from Tasks 4–5.
- Produces: the complete marked component and all visible states.

- [ ] **Step 1: Write the failing composer component tests**

Create `composer.spec.js` with Element Plus mounted and assert these states:

```js
it('renders the exact default controls and prompt guidance')
it('uploads 小豆Q版.png and displays 图片1')
it('inserts @图片1 only after the reference becomes ready')
it('updates ratio, resolution, duration, count, and audio configuration')
it('opens Dry-run preview instead of creating a paid task')
it('clear all resets editor, media, parameters, preview, and tasks')
it('requires confirmation before deleting media referenced by the editor')
```

Expected default visible strings:

```text
体验视频生成，让创意摇动
参考内容
使用 @ 可快速引用上传的文件
参考生成
智能比例
720P
5秒
1条
有声
0.046 元/千 tokens
```

- [ ] **Step 2: Run composer tests and verify failure**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/composer.spec.js
```

Expected: FAIL because UI components are missing.

- [ ] **Step 3: Implement the reference panel**

Use Element Plus Upload and icons. Before upload:

```js
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_FILE_SIZE = 30 * 1024 * 1024
```

Create an immediate object-URL preview, add a `local` media item, upload via the API module, then transition it to `ready` or `error`. Revoke object URLs on removal/unmount.

Use the real `小豆Q版.png` only in tests and browser verification; copy it to a test-fixture directory only if the test runner requires a stable relative path.

- [ ] **Step 4: Implement the options bar**

Render compact Element Plus popovers/selects for:

```js
const RATIO_OPTIONS = ['adaptive', '16:9', '9:16', '1:1']
const RESOLUTION_OPTIONS = ['720p', '1080p']
const DURATION_OPTIONS = [5, 10]
const COUNT_OPTIONS = [1, 2, 3, 4]
const AUDIO_OPTIONS = [true, false]
```

The source visual labels remain Chinese. Controls must be fully keyboard operable.

- [ ] **Step 5: Implement the request preview drawer**

Show five explicit sections:

```text
可读提示词
控制台兼容模板
模型规范文本
媒体映射
最终 API 请求
```

The primary composer submit button calls only `runDryRun`. The drawer renders blockers and a `仅复制 JSON` action. Render `确认真实生成` only when `data.realReady === true` and `confirmationToken` is non-empty; require a checkbox showing the exact count and cheapest selected parameters.

- [ ] **Step 6: Implement task status rendering and page assembly**

`GenerationTaskPanel` supports `idle`, `submitting`, `queued`, `running`, `succeeded`, `failed`, and `cancelled`. Do not autoplay audio. `index.vue` composes the upload panel, prompt editor, controls, price text, circular submit button, preview drawer, and task panel.

Use the exact source tokens from `docs/research/DESIGN_TOKENS.md`; do not estimate colors or spacing from memory.

- [ ] **Step 7: Run component tests and build**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__
npm run build
```

Expected: editor, store, serializer, composer, responsive class, and build checks pass.

- [ ] **Step 8: Commit the assembled UI**

Run:

```bash
git add src/view/videoGeneration
git commit -m "feat: build Ark reference video composer"
```

---

### Task 9: Complete Polling, Documentation, and Migration Handoff

**Files:**
- Modify: `src/view/videoGeneration/store/index.js`
- Modify: `src/view/videoGeneration/components/GenerationTaskPanel.vue`
- Create: `README.md`
- Create: `docs/migration/hc-gpt-web.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: task routes and UI from previous tasks.
- Produces: visibility-aware polling, runnable instructions, explicit migration steps, and security/cost documentation.

- [ ] **Step 1: Write failing polling tests**

Add fake-timer tests asserting:

```js
it('polls active tasks every three seconds')
it('polls every ten seconds while document.visibilityState is hidden')
it('stops polling succeeded, failed, and cancelled tasks')
it('does not recreate a task after query failure')
it('retains task IDs when polling times out')
```

- [ ] **Step 2: Run polling tests and verify failure**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/store.spec.js
```

Expected: the new polling tests fail.

- [ ] **Step 3: Implement visibility-aware polling**

Add `startPolling`, `stopPolling`, and `resumeTask` actions. Keep one timer per task ID, clear it on terminal state and store disposal, and use `donNotShowLoading: true` for queries to avoid global loading flashes after migration.

- [ ] **Step 4: Write the runnable README**

Document exact commands:

```bash
npm install
npm run serve
npm run test
npm run lint
npm run build
```

Document Dry-run as the default, every environment variable, why local URLs cannot reach Ark, how `PUBLIC_MEDIA_BASE_URL` works, how real mode is enabled, and why real task creation is never retried automatically.

- [ ] **Step 5: Write the `hc-gpt-web` migration guide**

`docs/migration/hc-gpt-web.md` must contain these exact phases:

```markdown
1. Copy `src/view/videoGeneration/` and `src/api/videoGeneration.js`.
2. Register `/video-generation` in the existing Hash Router/dynamic menu.
3. Delete the prototype `src/utils/request.js`; imports resolve to hc-gpt-web's existing wrapper.
4. Reuse existing Element Plus, Pinia, Tiptap, Axios, SCSS, and upload infrastructure.
5. Port `/videoGeneration/*` DTOs into hc-gpt-server Gin router/api/service layers without changing frontend payloads.
6. Connect model selection to existing aiModels/modelProvider data.
7. Run the copied serializer/component tests before enabling real generation.
```

Include a file-by-file compatibility matrix and call out that no Tiptap or Element Plus version upgrade is required.

- [ ] **Step 6: Run all non-visual quality gates**

Run:

```bash
npm run test
npm run lint
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit docs and polling**

Run:

```bash
git add src/view/videoGeneration README.md docs/migration .env.example
git commit -m "docs: complete runtime and migration handoff"
```

---

### Task 10: Browser Verification and Blocking Visual QA

**Files:**
- Create: `docs/design-references/ark-composer-implementation-desktop.png`
- Create: `docs/design-references/ark-composer-implementation-mobile.png`
- Create: `docs/design-references/ark-composer-comparison-desktop.png`
- Create: `docs/design-references/ark-composer-comparison-mobile.png`
- Create: `design-qa.md`
- Modify: source/UI files only when a P0/P1/P2 issue is found.

**Interfaces:**
- Consumes: source evidence from Task 1 and the running implementation from Tasks 2–9.
- Produces: verified no-cost interaction evidence and `design-qa.md` with `final result: passed`.

- [ ] **Step 1: Start the prototype and verify the route**

Run:

```bash
npm run serve
```

Open the local URL in the user-selected in-app browser. Verify the `/video-generation` Hash Router route renders, the console contains no errors, and the server health endpoint returns `{ code: 0 }`.

- [ ] **Step 2: Execute the no-cost reproduction scenario**

Perform these exact actions without clicking real generation:

```text
1. Upload 小豆Q版.png.
2. Verify 图片1 is ready.
3. Type "让 ".
4. Type @ and choose @图片1 with the keyboard.
5. Type " 挥手".
6. Change audio to 无声 and keep 720P / 5秒 / 1条.
7. Click submit and verify it opens Dry-run preview.
8. Verify readable/template/model prompts and image URL mapping.
9. Close preview, delete the mention, undo, redo, and use 全部清空.
```

Expected: no outbound Ark task request and no cost.

- [ ] **Step 3: Capture matching desktop and mobile implementation states**

Capture the same default/reference-added/mention-menu states used for source evidence at `1440 × 900` and `390 × 844`.

- [ ] **Step 4: Create side-by-side comparison images**

Place each source screenshot and matching implementation screenshot into one comparison image with identical crop height and labeled halves. Do not judge separate image views.

- [ ] **Step 5: Run the design QA loop**

Review fonts/typography, spacing/layout rhythm, colors/tokens, image quality/assets, copy, responsiveness, focus/hover/disabled states, and menu/drawer behavior. Record every P0/P1/P2 finding, fix it, capture again, and compare again.

Write `design-qa.md` with:

```markdown
# Design QA
- Source visual truth paths
- Implementation screenshot paths
- Viewports and states
- Full-view comparison evidence
- Focused composer comparison evidence
- Primary interactions tested
- Browser console errors checked
- Comparison history and fixes
- Residual P3 polish
- final result: passed
```

- [ ] **Step 6: Run final automated verification**

Run:

```bash
npm run test
npm run lint
npm run build
git status --short
```

Expected: all gates pass; `git status` contains only the intentional QA evidence/report before commit.

- [ ] **Step 7: Do not trigger paid generation automatically**

Stop after Dry-run verification. If a real Ark call is still required, request explicit action-time confirmation describing the single `720p`, `5s`, `1`, `无声` task and its potential charge. Only after confirmation may the real button be used once.

- [ ] **Step 8: Commit the passing QA evidence**

Run:

```bash
git add docs/design-references design-qa.md src
git commit -m "test: verify Ark video composer fidelity"
```

Expected: the final commit includes `design-qa.md` with `final result: passed`.

---

## Plan Self-Review Results

- **Spec coverage:** Every approved requirement maps to Tasks 1–10: source capture, compatible runtime, serializer, uploads, Dry-run, guarded real API, store, editor, complete component, polling, migration docs, browser verification, and visual QA.
- **Security coverage:** API key isolation, public-media validation, one-time confirmation, sequential count handling, no automatic paid retry, error redaction, and action-time confirmation are explicit.
- **Migration coverage:** `hc-gpt-web` package versions, Element Plus, Pinia, Axios module conventions, response envelope, Hash Router, environment names, folder layout, and Gin migration boundary are explicit.
- **Cost coverage:** All default tests are non-billable; real generation is an optional separately confirmed final step.
- **Type consistency:** `mediaId`, `realIndex`, `sourceLabel`, `canonicalIndex`, `generateAudio`, `confirmationToken`, `realReady`, and `{ code, data, msg }` use the same names across tasks.

## Target File Map

```text
Video-Generation-API /
├── .env.development
├── .env.example
├── .gitignore
├── .eslintrc.cjs
├── index.html
├── package.json
├── vite.config.js
├── vitest.config.js
├── vitest.setup.js
├── scripts/serve.mjs
├── src/
│   ├── App.vue
│   ├── main.js
│   ├── api/videoGeneration.js
│   ├── pinia/index.js
│   ├── router/index.js
│   ├── utils/request.js
│   └── view/videoGeneration/
│       ├── index.vue
│       ├── components/
│       │   ├── ReferenceMediaPanel.vue
│       │   ├── PromptComposer.vue
│       │   ├── MediaSuggestionMenu.vue
│       │   ├── GenerationOptionsBar.vue
│       │   ├── RequestPreviewDrawer.vue
│       │   └── GenerationTaskPanel.vue
│       ├── editor/
│       │   ├── mediaMention.js
│       │   └── mediaSuggestion.js
│       ├── store/index.js
│       ├── styles/index.scss
│       ├── utils/requestBuilder.js
│       └── __tests__/
│           ├── requestBuilder.spec.js
│           ├── store.spec.js
│           ├── mediaMention.spec.js
│           └── composer.spec.js
├── server/
│   ├── index.js
│   ├── app.js
│   ├── config.js
│   ├── ark/client.js
│   ├── media/store.js
│   ├── security/confirmationStore.js
│   └── routes/videoGeneration.js
├── server/__tests__/
│   ├── media.spec.js
│   ├── dryRun.spec.js
│   └── realGeneration.spec.js
├── uploads/.gitkeep
├── docs/
│   ├── design-references/
│   ├── research/
│   └── migration/hc-gpt-web.md
├── README.md
└── design-qa.md
```

### Interface Contracts

```js
// src/view/videoGeneration/utils/requestBuilder.js
export function collectCanonicalMedia(doc, mediaList) {}
export function serializePrompt(doc, mediaList) {}
export function buildArkRequest({ doc, mediaList, config, model }) {}
export function validateRealSubmission({ serialization, runtime }) {}

// server/app.js
export function createApp({ config, arkClient, mediaStore, confirmationStore }) {}

// server/ark/client.js
export function createArkClient({ baseUrl, apiKey, fetchImpl = fetch }) {}

// server/security/confirmationStore.js
export function createConfirmationStore({ ttlMs = 300000 } = {}) {}

// src/view/videoGeneration/store/index.js
export const useVideoGenerationStore = defineStore('videoGeneration', () => {})
```

---

### Task 1: Capture Source Evidence with the Installed Clone Workflow

**Files:**
- Create: `docs/design-references/ark-video-composer-desktop.png`
- Create: `docs/design-references/ark-video-composer-tablet.png`
- Create: `docs/design-references/ark-video-composer-mobile.png`
- Create: `docs/design-references/ark-video-composer-reference-added.png`
- Create: `docs/design-references/ark-video-composer-mention-menu.png`
- Create: `docs/research/DESIGN_TOKENS.md`
- Create: `docs/research/BEHAVIORS.md`
- Create: `docs/research/PAGE_TOPOLOGY.md`
- Create: `docs/research/components/video-composer.spec.md`

**Interfaces:**
- Consumes: The logged-in in-app browser page and the user's `小豆Q版.png` reference image.
- Produces: Auditable source screenshots, exact CSS/token evidence, topology, and interaction descriptions consumed by Tasks 7–10.

- [ ] **Step 1: Verify the installed clone skill and source URL**

Run:

```bash
test -f /Users/huachi/.codex/skills/clone-website/SKILL.md
```

Expected: exit code `0`.

Open the exact source URL in the user-selected in-app browser. Verify the page title is `火山方舟 - 体验`, the model query is `doubao-seedance-2-0-260128`, and the centered form contains `参考内容`, `参考生成`, `智能比例`, `720P`, `5秒`, `1条`, and `有声`.

- [ ] **Step 2: Capture the default desktop, tablet, and mobile states**

Capture the composer at desktop viewport `1440 × 900`, tablet viewport `768 × 1024`, and mobile viewport `390 × 844`. Save only local evidence files under `docs/design-references/`; do not hotlink source assets.

Expected desktop evidence: a centered white composer with a pale violet border, rounded outer frame, upload tile on the left, prompt placeholder across the upper row, compact controls along the bottom, price text, and a circular purple submit button.

Expected mobile evidence: the same controls remain reachable without horizontal clipping; parameter controls may wrap, but upload, prompt, and submit remain visible.

- [ ] **Step 3: Capture the no-cost reference and mention states**

Upload:

```text
/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png
```

Do not click the final generate button. Capture the reference-added state, then type `让 @` and capture the `@图片1` suggestion menu. Select the suggestion, type `挥手`, and verify the editor displays a single atomic media tag between the two text fragments.

Expected: no video task is created and no generation cost is incurred.

- [ ] **Step 4: Extract visual tokens and component behavior**

Write `docs/research/DESIGN_TOKENS.md` with exact observed values for:

```markdown
# Design Tokens
- Composer width and minimum height
- Outer background, border color, border radius, and shadow
- Primary, secondary, placeholder, border, hover, disabled, and purple accent colors
- Font family, sizes, weights, and line heights
- Upload tile size and thumbnail crop
- Control heights, gaps, padding, radii, and submit-button size
- Desktop and mobile layout changes
```

Write `docs/research/BEHAVIORS.md` with a mandatory scroll, click, hover, keyboard, and responsive sweep, including these source-backed states:

```markdown
# Behaviors
- Empty reference state
- Uploaded reference state
- @ menu closed/open/keyboard-selected states
- Mention inserted/focused/deleted states
- Parameter menu open/selected states
- Empty prompt, valid prompt, disabled submit, and ready submit states
- Clear-all state
```

Write `docs/research/PAGE_TOPOLOGY.md` identifying the selected composer as the only cloned section, its DOM boundary, flow/overlay layers, z-index relationships, and interaction model. Explicitly record that Ark navigation, gallery, authentication, and history are outside the clone boundary.

- [ ] **Step 5: Write the component source-of-truth specification**

Write `docs/research/components/video-composer.spec.md` with the exact DOM hierarchy, computed styles obtained through `getComputedStyle()`, verbatim text, local icons/assets, all captured interactions and states, responsive behavior at 1440/768/390 widths, and the local paths of all screenshots. Mark each non-applicable template section as `N/A` instead of omitting it.

Expected: no field says `TBD`, `TODO`, `approximate`, or `guess`.

- [ ] **Step 6: Commit the reconnaissance artifacts**

Run:

```bash
git add docs/design-references docs/research
git commit -m "docs: capture ark video composer source evidence"
```

Expected: a commit containing screenshots and three research documents, with no application code.

---

### Task 2: Scaffold the `hc-gpt-web`-Compatible Runtime

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.development`
- Create: `.env.example`
- Create: `.eslintrc.cjs`
- Create: `index.html`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `vitest.setup.js`
- Create: `scripts/serve.mjs`
- Create: `src/main.js`
- Create: `src/App.vue`
- Create: `src/router/index.js`
- Create: `src/pinia/index.js`
- Create: `src/utils/request.js`
- Create: `src/view/videoGeneration/index.vue`
- Create: `tests/scaffold.spec.js`

**Interfaces:**
- Consumes: The approved architecture and `hc-gpt-web` package/runtime conventions.
- Produces: `npm run serve`, `npm run test`, `npm run lint`, and `npm run build`; `@` alias; Hash Router route `/video-generation`; Axios response envelope compatibility.

- [ ] **Step 1: Create the package manifest and runtime configuration**

Create `package.json` with these exact scripts and dependency families:

```json
{
  "name": "ark-reference-video-composer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "serve": "node scripts/serve.mjs",
    "dev:web": "vite --host 0.0.0.0 --mode development",
    "dev:server": "node --watch server/index.js",
    "test": "vitest --run",
    "lint": "eslint . --max-warnings=0",
    "build": "vite build --mode production"
  },
  "dependencies": {
    "@element-plus/icons-vue": "^2.1.0",
    "@tiptap/core": "^2.1.13",
    "@tiptap/starter-kit": "^2.1.13",
    "@tiptap/suggestion": "^2.1.13",
    "@tiptap/vue-3": "^2.1.13",
    "axios": "^1.4.0",
    "element-plus": "^2.11.1",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "pinia": "^2.1.4",
    "sass": "^1.89.2",
    "vue": "^3.3.4",
    "vue-router": "^4.2.4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^4.2.3",
    "@vue/test-utils": "^2.4.6",
    "eslint": "^8.49.0",
    "eslint-plugin-vue": "^9.15.1",
    "happy-dom": "^20.0.10",
    "vite": "^4.4.6",
    "vitest": "^4.0.8"
  }
}
```

Create `.env.development` and `.env.example` with:

```dotenv
VITE_CLI_PORT=8080
VITE_SERVER_PORT=8888
VITE_BASE_API=/api
VITE_BASE_PATH=http://127.0.0.1
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seedance-2-0-260128
ARK_API_KEY=
PUBLIC_MEDIA_BASE_URL=
APP_REAL_GENERATION_ENABLED=false
```

Create `.gitignore` containing:

```gitignore
node_modules/
dist/
uploads/*
!uploads/.gitkeep
.env.local
.env.production
*.log
```

Create `.eslintrc.cjs` containing:

```js
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ['eslint:recommended', 'plugin:vue/vue3-recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/require-default-prop': 'off',
  },
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and installation exits `0`.

- [ ] **Step 3: Write the failing scaffold test**

Create `tests/scaffold.spec.js`:

```js
import { describe, expect, it } from 'vitest'
import router from '@/router/index'

describe('application scaffold', () => {
  it('registers the migration-compatible hash route', () => {
    const route = router.getRoutes().find((item) => item.name === 'VideoGeneration')
    expect(route?.path).toBe('/video-generation')
  })
})
```

- [ ] **Step 4: Run the scaffold test and verify failure**

Run:

```bash
npm run test -- tests/scaffold.spec.js
```

Expected: FAIL because `@/router/index` does not exist.

- [ ] **Step 5: Implement the minimal compatible shell**

Create `src/router/index.js`:

```js
import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/video-generation',
  },
  {
    path: '/video-generation',
    name: 'VideoGeneration',
    component: () => import('@/view/videoGeneration/index.vue'),
  },
]

export default createRouter({ history: createWebHashHistory(), routes })
```

Create `src/pinia/index.js`:

```js
import { createPinia } from 'pinia'
export const store = createPinia()
```

Create `src/main.js`:

```js
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from '@/router/index'
import { store } from '@/pinia'

createApp(App).use(store).use(router).use(ElementPlus).mount('#app')
```

Create `src/App.vue`:

```vue
<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>
```

Create `src/view/videoGeneration/index.vue`:

```vue
<template>
  <main class="video-generation-page">
    <h1>体验视频生成，让创意摇动</h1>
  </main>
</template>
```

Create `src/utils/request.js`:

```js
import axios from 'axios'

const service = axios.create({
  baseURL: import.meta.env.VITE_BASE_API,
  timeout: 99999,
})

service.interceptors.response.use((response) => response.data)
export default service
```

Configure `vite.config.js` with `@` alias, `base: './'`, port `VITE_CLI_PORT`, and `/api` proxy that preserves the prefix and targets `VITE_BASE_PATH:VITE_SERVER_PORT`.

Create `vite.config.js`:

```js
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './',
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.VITE_CLI_PORT || 8080),
      proxy: {
        '/api': {
          target: `${env.VITE_BASE_PATH || 'http://127.0.0.1'}:${env.VITE_SERVER_PORT || 8888}`,
          changeOrigin: true,
        },
      },
    },
  }
})
```

Create `vitest.config.js`:

```js
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'happy-dom', setupFiles: ['./vitest.setup.js'], restoreMocks: true },
})
```

Create `vitest.setup.js`:

```js
import { afterEach } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})
```

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>方舟参考视频生成</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.js"></script></body>
</html>
```

Create `scripts/serve.mjs`:

```js
import { spawn } from 'node:child_process'

const children = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
]

let exiting = false
const stop = (signal = 'SIGTERM') => {
  if (exiting) return
  exiting = true
  for (const child of children) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal))
for (const child of children) {
  child.on('exit', (code) => {
    if (!exiting) {
      stop()
      process.exitCode = code ?? 1
    }
  })
}
```

- [ ] **Step 6: Run the scaffold quality gates**

Run:

```bash
npm run test -- tests/scaffold.spec.js
npm run build
```

Expected: one passing test and a successful Vite build.

- [ ] **Step 7: Commit the scaffold**

Run:

```bash
git add package.json package-lock.json .gitignore .eslintrc.cjs .env.development .env.example index.html vite.config.js vitest.config.js vitest.setup.js scripts src tests
git commit -m "chore: scaffold hc-gpt-web compatible prototype"
```

---

### Task 3: Implement Deterministic Prompt Serialization with TDD

**Files:**
- Create: `src/view/videoGeneration/utils/requestBuilder.js`
- Create: `src/view/videoGeneration/__tests__/requestBuilder.spec.js`

**Interfaces:**
- Consumes: Tiptap JSON, `ReferenceMedia[]`, `GenerationConfig`, model ID.
- Produces: `collectCanonicalMedia`, `serializePrompt`, `buildArkRequest`, `validateRealSubmission`.

- [ ] **Step 1: Write the failing serializer tests**

Create `src/view/videoGeneration/__tests__/requestBuilder.spec.js`:

```js
import { describe, expect, it } from 'vitest'
import {
  buildArkRequest,
  collectCanonicalMedia,
  serializePrompt,
} from '../utils/requestBuilder'

const image1 = {
  id: 'media-1',
  kind: 'image',
  name: '小豆Q版.png',
  realIndex: 1,
  previewUrl: '/uploads/media-1.png',
  remoteUrl: 'https://media.example/xiaodou.png',
  mimeType: 'image/png',
  size: 87040,
  status: 'ready',
}

const image2 = {
  id: 'media-2',
  kind: 'image',
  name: '龙女Q版.png',
  realIndex: 2,
  previewUrl: '/uploads/media-2.png',
  remoteUrl: 'https://media.example/longnv.png',
  mimeType: 'image/png',
  size: 209920,
  status: 'ready',
}

const doc = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: '让 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
      { type: 'text', text: ' 模仿 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-1', kind: 'image', sourceLabel: '图片1', realIndex: 1 } },
      { type: 'text', text: ' 挥手，再让 ' },
      { type: 'mediaMention', attrs: { mediaId: 'media-2', kind: 'image', sourceLabel: '图片2', realIndex: 2 } },
      { type: 'text', text: ' 转身' },
    ],
  }],
}

describe('requestBuilder', () => {
  it('deduplicates media by first mention and preserves realIndex', () => {
    expect(collectCanonicalMedia(doc, [image1, image2]).map((item) => item.id)).toEqual(['media-2', 'media-1'])
  })

  it('creates readable, template, and model prompts', () => {
    expect(serializePrompt(doc, [image1, image2])).toMatchObject({
      readablePrompt: '让 @图片2 模仿 @图片1 挥手，再让 @图片2 转身',
      templatePrompt: '让 <<<image_1_2>>> 模仿 <<<image_2_1>>> 挥手，再让 <<<image_1_2>>> 转身',
      modelPrompt: '让 【图片 1】 模仿 【图片 2】 挥手，再让 【图片 1】 转身',
    })
  })

  it('builds public Ark content with text first and canonical media after it', () => {
    const result = buildArkRequest({
      doc,
      mediaList: [image1, image2],
      model: 'doubao-seedance-2-0-260128',
      config: { mode: 'reference_media', ratio: 'adaptive', resolution: '720p', duration: 5, count: 1, generateAudio: false },
    })
    expect(result.content).toEqual([
      { type: 'text', text: '让 【图片 1】 模仿 【图片 2】 挥手，再让 【图片 1】 转身' },
      { type: 'image_url', role: 'reference_image', image_url: { url: 'https://media.example/longnv.png' } },
      { type: 'image_url', role: 'reference_image', image_url: { url: 'https://media.example/xiaodou.png' } },
    ])
    expect(result).toMatchObject({ model: 'doubao-seedance-2-0-260128', ratio: 'adaptive', resolution: '720p', duration: 5, generate_audio: false })
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/requestBuilder.spec.js
```

Expected: FAIL because `requestBuilder.js` does not exist.

- [ ] **Step 3: Implement the pure serializer**

Implement `requestBuilder.js` so it:

```js
const TOKEN_BY_KIND = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

export function collectCanonicalMedia(doc, mediaList) {
  const byId = new Map(mediaList.map((item) => [item.id, item]))
  const ordered = []
  const seen = new Set()
  walkNodes(doc, (node) => {
    if (node.type !== 'mediaMention') return
    const item = byId.get(node.attrs?.mediaId)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      ordered.push(item)
    }
  })
  for (const item of mediaList) {
    if (!seen.has(item.id)) ordered.push(item)
  }
  return ordered
}
```

Use one recursive `walkNodes` helper and one canonical index map shared by all three prompt projections. Resolve the media URL as `asset://<assetId>` first, otherwise `remoteUrl`, otherwise `local://<id>` and mark it `notPublic` in the serialization metadata.

- [ ] **Step 4: Run serializer tests and add edge cases**

Add tests for newlines, missing media, unmentioned references appended after mentioned references, empty text, and `asset://` resolution.

Run:

```bash
npm run test -- src/view/videoGeneration/__tests__/requestBuilder.spec.js
```

Expected: all serializer tests pass.

- [ ] **Step 5: Commit the serializer**

Run:

```bash
git add src/view/videoGeneration/utils/requestBuilder.js src/view/videoGeneration/__tests__/requestBuilder.spec.js
git commit -m "feat: serialize inline media references for Ark"
```

---

### Task 4: Implement Media Storage and Dry-run Routes

**Files:**
- Create: `server/config.js`
- Create: `server/media/store.js`
- Create: `server/app.js`
- Create: `server/index.js`
- Create: `server/routes/videoGeneration.js`
- Create: `server/__tests__/media.spec.js`
- Create: `server/__tests__/dryRun.spec.js`
- Create: `uploads/.gitkeep`

**Interfaces:**
- Consumes: `buildArkRequest` and `validateRealSubmission` from Task 3.
- Produces: `createMediaStore`, `createApp`, `/api/videoGeneration/uploadReference`, `/deleteReference`, and `/dryRun`.

- [ ] **Step 1: Write failing media and Dry-run contract tests**

Create `server/__tests__/dryRun.spec.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { createApp } from '../app'

describe('videoGeneration dryRun', () => {
  let server
  let baseUrl

  beforeEach(async () => {
    const app = createApp({
      config: { arkModel: 'doubao-seedance-2-0-260128', realGenerationEnabled: false },
      arkClient: { createTask: vi.fn(), getTask: vi.fn() },
      mediaStore: { get: vi.fn(), save: vi.fn(), remove: vi.fn() },
      confirmationStore: { issue: vi.fn(), consume: vi.fn() },
    })
    server = createServer(app)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  it('returns hc-gpt-web envelope and never calls Ark', async () => {
    const response = await fetch(`${baseUrl}/api/videoGeneration/dryRun`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '小豆挥手' }] }] },
        mediaList: [],
        config: { mode: 'reference_media', ratio: 'adaptive', resolution: '720p', duration: 5, count: 1, generateAudio: false },
      }),
    })
    expect(await response.json()).toMatchObject({ code: 0, data: { realReady: false }, msg: 'Dry-run 校验成功' })
  })
})
```

Create `server/__tests__/media.spec.js` with a 1×1 PNG fixture buffer and assert:

```js
expect(uploadResponse.code).toBe(0)
expect(uploadResponse.data).toMatchObject({ kind: 'image', mimeType: 'image/png', status: 'ready' })
expect(uploadResponse.data.previewUrl).toMatch(/^\/uploads\//)
```

- [ ] **Step 2: Run contract tests and verify failure**

Run:

```bash
npm run test -- server/__tests__/media.spec.js server/__tests__/dryRun.spec.js
```

Expected: FAIL because `server/app.js` does not exist.

- [ ] **Step 3: Implement configuration and disk-backed media storage**

Implement `server/config.js`:

```js
export function loadConfig(env = process.env) {
  return {
    port: Number(env.VITE_SERVER_PORT || 8888),
    arkBaseUrl: env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    arkModel: env.ARK_MODEL || 'doubao-seedance-2-0-260128',
    arkApiKey: env.ARK_API_KEY || '',
    publicMediaBaseUrl: env.PUBLIC_MEDIA_BASE_URL || '',
    realGenerationEnabled: env.APP_REAL_GENERATION_ENABLED === 'true',
  }
}
```

Implement `createMediaStore({ uploadDir, publicBaseUrl })` with `save`, `get`, `remove`, and `list`. Validate PNG/JPEG/WebP MIME and magic bytes, enforce 30 MB, generate UUID filenames, and construct `previewUrl` plus optional HTTPS `remoteUrl`.

- [ ] **Step 4: Implement Express routes with the target envelope**

Implement `createApp` with `express.json({ limit: '2mb' })`, static `/uploads`, Multer memory upload, and a router mounted at `/api/videoGeneration`.

Add `GET /api/health` returning `{ code: 0, data: { status: 'ok' }, msg: '服务正常' }` so the combined runtime has a deterministic readiness probe.

Use these response helpers:

```js
export const ok = (res, data, msg = '操作成功') => res.json({ code: 0, data, msg })
export const fail = (res, code, msg, data = {}) => res.status(400).json({ code, data, msg })
```

Dry-run must call only the pure serializer and return:

```js
{
  serialization,
  request,
  blockers,
  realReady: blockers.length === 0,
  confirmationToken: '',
}
```

- [ ] **Step 5: Run media and Dry-run tests**

Run:

```bash
npm run test -- server/__tests__/media.spec.js server/__tests__/dryRun.spec.js
```

Expected: all tests pass and the Ark mock remains uncalled.

- [ ] **Step 6: Commit media and Dry-run support**

Run:

```bash
git add server uploads src/view/videoGeneration/utils/requestBuilder.js
git commit -m "feat: add local media and dry-run API"
```

---

### Task 5: Implement the Guarded Ark Client and Task Routes

**Files:**
- Create: `server/ark/client.js`
- Create: `server/security/confirmationStore.js`
- Modify: `server/routes/videoGeneration.js`
- Create: `server/__tests__/realGeneration.spec.js`

**Interfaces:**
- Consumes: serialized Ark payload, runtime configuration, and the Express response envelope.
- Produces: `createArkClient`, `createConfirmationStore`, guarded `/createTask`, `/getTask`, and `/deleteTask` routes.

- [ ] **Step 1: Write failing confirmation and Ark route tests**

Create `server/__tests__/realGeneration.spec.js` covering these exact cases:

```js
it('blocks real generation when the feature flag is false')
it('blocks real generation when ARK_API_KEY is empty')
it('blocks local-only media URLs')
it('issues a five-minute single-use confirmation token after valid dry-run')
it('creates one task for count=1 and consumes the token')
it('rejects a reused confirmation token')
it('creates tasks sequentially and stops when count=2 second creation fails')
it('never includes the API key in a response or error message')
```

The successful fetch mock must assert:

```js
expect(fetchImpl).toHaveBeenCalledWith(
  'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
  expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer secret-test-key' }),
  }),
)
```

- [ ] **Step 2: Run real-generation tests and verify failure**

Run:

```bash
npm run test -- server/__tests__/realGeneration.spec.js
```

Expected: FAIL because the Ark client and confirmation store do not exist.

- [ ] **Step 3: Implement the single-use confirmation store**

Implement:

```js
export function createConfirmationStore({ ttlMs = 300000 } = {}) {
  const tokens = new Map()
  return {
    issue(payloadHash) {
      const token = crypto.randomUUID()
      tokens.set(token, { payloadHash, expiresAt: Date.now() + ttlMs })
      return token
    },
    consume(token, payloadHash) {
      const entry = tokens.get(token)
      tokens.delete(token)
      return Boolean(entry && entry.payloadHash === payloadHash && entry.expiresAt > Date.now())
    },
  }
}
```

Hash only the canonical JSON payload and count; never hash or store the API key.

- [ ] **Step 4: Implement the Ark HTTP client**

`createArkClient` exposes:

```js
return {
  createTask: (payload) => request('/contents/generations/tasks', { method: 'POST', body: payload }),
  getTask: (id) => request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'GET' }),
  deleteTask: (id) => request(`/contents/generations/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
```

Normalize Ark errors to `{ status, code, message, requestId }`; redact the Authorization value from every thrown error.

- [ ] **Step 5: Implement guarded task routes**

`dryRun` issues a token only when all blockers are absent. `createTask` must:

1. Rebuild the payload server-side.
2. Recompute its canonical hash.
3. Consume the matching single-use token.
4. Create `count` tasks sequentially.
5. Stop immediately on failure and return already-created task IDs plus the normalized error.

- [ ] **Step 6: Run all server tests**

Run:

```bash
npm run test -- server/__tests__
```

Expected: media, Dry-run, confirmation, create/query/delete, redaction, and multi-count tests all pass.

- [ ] **Step 7: Commit guarded real generation**

Run:

```bash
git add server/ark server/security server/routes server/__tests__
git commit -m "feat: guard Ark video generation tasks"
```

---
