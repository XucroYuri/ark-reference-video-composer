# Behaviors

## Evidence and safety boundary

- Live title: `火山方舟 - 体验`.
- Live URL: `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`.
- Browser: authenticated OpenCLI session `ark-recon`.
- Page uniqueness before upload: one `form`, one `input[type=file]`, one `[contenteditable=true][role=textbox]`, and one `[data-testid=video-sender-submit-button]`.
- Authorized file: `/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png`, `86,673` bytes.
- The submit/generate control was never clicked. DOM checks found zero task/result test-id nodes after upload and editing. No video task was created and no generation cost was triggered.

The prior in-app browser timeout is resolved provenance, not a current gate. OpenCLI `browser upload` first returned `Not allowed`; its retry exposed a known stale `markerAttr` declaration in CLI `1.7.18`. The same OpenCLI browser bridge then attached the one authorized PNG by assigning a single `File` through `DataTransfer` and dispatching `input` and `change`. Ark accepted it and rendered the real uploaded thumbnail. No other file was attached.

## Mandatory interaction sweep

### Scroll

The composer is ordinary flow content inside `#exp-studio-conversation-sender-scroll-container`.

| State | Exact result |
| --- | --- |
| Container | `clientHeight=552`, `scrollHeight=3339`, `scroll-behavior:auto`, `scroll-snap-type:none` |
| `scrollTop=0` | Form `x=390,y=275,width=880,height=152`; `position:static`; `top:auto`; `z-index:auto` |
| `scrollTop=120` | Form `x=390,y=155,width=880,height=152`; style values unchanged |
| Restore | `scrollTop` returned to `0` |

The form moves one-for-one with the scroll container. It is not sticky, fixed, scroll-snapped, or scroll-animated.

### Click

- Clicking the parameter trigger opens the source parameter popover. It does not alter the current selections until an option is clicked.
- Clicking the mode combobox opens a listbox with `参考生成`, `首尾帧`, and `版权IP生成`; `参考生成` is selected.
- Clicking the active mention-menu item inserts one atomic `@图片1` node and closes the menu.
- Clicking the inserted mention keeps the editor active and adds `aml-arco-popover-open` to its inner alignment wrapper. The source tooltip is a `242 × 242px` white image-preview panel with `1px solid #D0D0E1`, radius `8px`, and shadow `rgba(0,0,0,.05) 0 15px 35px -2px`; it has no button or delete affordance.
- Clicking `全部清空` resets references and editor content together. It also removes the `@` trigger and clear-all button and returns submit to its disabled style.
- The submit button was queried and hover-tested only. It received no click event.

### Hover

Hover was applied to the ready submit button, `@` trigger, parameter trigger, and clear-all button. For all four, the checked computed properties—background, border, shadow, opacity, transform, ink, and cursor—remained the same as their resting values. Their source transition declarations remain in the design-token record.

### Keyboard and editor

1. `browser type` entered `让 @` into the unique textbox.
2. Ark converted the trailing `@` into `<span class="suggestion is-empty">@</span>` and opened the mention menu.
3. The sole menu item had class `mentionListItem-jQvMWE active-Ae7A0B` immediately on open, establishing the keyboard-active state.
4. Selecting it inserted one `contenteditable="false"`, draggable node labeled `@图片1`.
5. The caret was placed after the node and ` 挥手` was inserted, producing exact editor text `让 @图片1 挥手`.
6. A single `Backspace` with only a caret immediately after the atomic node did not delete it; the node count remained `1`.
7. Selecting the complete atomic DOM range changed its class to `react-renderer node-mediaTagSlot ProseMirror-selectednode` and produced a range selection containing `@图片1`.
8. `Backspace` in that selected-node state removed the mention. The editor became `<p class="ark-sender-richTextArea-paragraph">让  挥手</p>`, mention count became `0`, and the selection collapsed to a caret at text offset `2`.
9. Mention removal left the uploaded reference list item intact (`1`), kept the mention menu closed, kept `全部清空` visible, and left submit ready (`disabled=false`, `#5252FF`, opacity `1`, pointer cursor).

OpenCLI `browser type` has replace-all semantics for contenteditable fields. The trailing fragment was therefore inserted with a focused browser `execCommand("insertText")`, which triggered the live ProseMirror editor and preserved the atomic node.

### Responsive

- `1440 × 900`: full composer and submit visible.
- `768 × 1024`: composer narrows, prompt wraps, all controls remain visible on one row.
- `390 × 844`: the Ark page retains a wider inner layout and clips horizontally. Only the left part of the composer is visible; submit is off-screen. This is source behavior, not a capture defect.

## State matrix

| State | Source-backed result |
| --- | --- |
| Empty reference | `ark-video-composer-desktop.png`, `tablet.png`, and `mobile.png`; tile reads `参考内容`; no thumbnail; submit is disabled |
| Uploaded reference | `ark-video-composer-reference-added.png`; one thumbnail labeled `图片1`; overlapping add button and `全部清空` appear |
| `@` menu closed | No `.mentionList-BMGCpP` in DOM after insertion |
| `@` menu open | `ark-video-composer-mention-menu.png`; body-level `react-renderer`, `160 × 103px`, `z-index:9999` |
| `@` menu keyboard-active | First and only item carries `active-Ae7A0B` immediately after typing `@` |
| Mention inserted | One `.node-mediaTagSlot`, `contenteditable=false`, `draggable=true`, label `@图片1` |
| Mention focused | Editor stays active; inner wrapper receives `aml-arco-popover-open`; `242 × 242px` image-preview tooltip opens with no delete control |
| Mention deleted | Select atomic node → class adds `ProseMirror-selectednode` → Backspace; result text `让  挥手`, mention count `0`, reference count `1`, menu closed, submit still ready |
| Parameter menu open | Popover lists all ratio, resolution, duration, quantity, and sound choices below |
| Parameter selected | Trigger shows `智能比例`, `720P`, `5秒`, `1条`, `有声` |
| Empty prompt | Guidance appears in the empty-state captures; disabled submit has `disabled=true`, opacity `0.5`, cursor `not-allowed` |
| Valid prompt | With upload and `让 @图片1 挥手`, submit has `disabled=false`, opacity `1`, `#5252FF`, pointer cursor |
| Clear-all | Click `全部清空`; result is empty editor/placeholder, `0` references, `0` images, `0` mentions, `0` `@` triggers, `0` clear-all buttons, empty file input, and disabled submit |

## Complete mention-removal evidence

Selected state:

```text
node class: react-renderer node-mediaTagSlot ProseMirror-selectednode
selection type: Range
selection text: @图片1
anchor/focus: paragraph child offsets 1 → 2
```

After Backspace:

```html
<p class="ark-sender-richTextArea-paragraph">让  挥手</p>
```

```text
mentionCount=0
referenceListItems=1
menuOpen=false
clearButtons=1
submit.disabled=false
submit.background=#5252FF
submit.opacity=1
submit.cursor=pointer
```

## Clear-all reset evidence

After clicking `.clear-all-button-rVxGU5`, the editor is the source empty document:

```html
<p class="ark-sender-richTextArea-paragraph is-empty is-editor-empty"
   data-placeholder="使用@可快速引用上传的文件，如：参考@视频1 中的动作，生成@图片2 和@图片3 中的角色打斗的视频。">
  <br class="ProseMirror-trailingBreak">
</p>
```

Exact reset state:

```text
editorText=""
referenceListItems=0
referenceLabels=0
referenceImages=0
mentionCount=0
menuOpen=false
plusTriggers=0
mentionTriggers=0
clearButtons=0
fileInput.files=[]
uploaderClass="wrapper-WWLMTm wrapper-empty-mwy5cP"
uploaderText="参考内容"
```

The reset paragraph remains `15px/26px`, weight `400`, color `#0B0B0F`, transparent background, and text cursor. The uploader wrapper is `86 × 78px`, transparent, and uses the base `14px/21px` stack. Submit becomes `disabled=true`, background `#ACB4FF`, opacity `0.5`, radius `9999px`, and `cursor:not-allowed`.

## Parameter popover content

| Group | Exact source choices | Selected in trigger |
| --- | --- | --- |
| 视频比例 | `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `智能` | `智能比例` |
| 分辨率 | `480P`, `720P`, `1080P`, `4K` | `720P` |
| 视频时长 | `按秒数`, `智能时长`, `4s` through `15s` | `5秒` |
| 选择生成数量 | `1` through `8` | `1条` |
| 输出声音 | `开`, `关` | `有声` |

## Mention menu content and DOM

```text
全部   图片
图片1
```

```html
<div class="react-renderer">
  <div class="mentionList-BMGCpP mentionListWithTabs-nxTEO8">
    <div class="mentionTabs-mXN7co" role="tablist">
      <button role="tab" aria-selected="true"><span>全部</span></button>
      <button role="tab" aria-selected="false"><span>图片</span></button>
    </div>
    <div class="mentionListItems-M_bmDA">
      <div class="mentionListScroll-wxPe9G">
        <div class="mentionListItem-jQvMWE active-Ae7A0B">
          <img class="ark-sender-mediaIcon">
          <div class="label-ecmScL">图片1</div>
        </div>
      </div>
    </div>
  </div>
</div>
```

## Submit-state evidence

| Condition | Disabled | Background | Opacity | Cursor |
| --- | --- | --- | --- | --- |
| Empty default composer | `true` | `#ACB4FF` | `0.5` | `not-allowed` |
| Reference uploaded and valid editor content | `false` | `#5252FF` | `1` | `pointer` |
| Mention deleted, reference retained | `false` | `#5252FF` | `1` | `pointer` |
| After `全部清空` | `true` | `#ACB4FF` | `0.5` | `not-allowed` |

The source also enabled submit after the reference upload before a textual prompt was inserted. A clone should therefore derive readiness from Ark's accepted-input model rather than requiring non-empty plain text alone.

## Verbatim source copy

```text
参考内容
使用@可快速引用上传的文件，如：参考@视频1中的动作，生成@图片2和@图片3中的角色打斗的视频。
图片1
参考生成
智能比例
720P
5秒
1条
有声
@
全部清空
0.046 元/千 tokens
```
