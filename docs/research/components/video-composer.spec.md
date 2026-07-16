# Video Composer Specification

## Overview

- **Assembly target:** `src/view/videoGeneration/index.vue`
- **Planned child components:** `ReferenceMediaPanel.vue`, `PromptComposer.vue`, `MediaSuggestionMenu.vue`, `GenerationOptionsBar.vue`
- **Source title:** `火山方舟 - 体验`
- **Source URL:** `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`
- **Clone boundary:** `form.agentic-sender` only
- **Interaction model:** pointer and keyboard state; normal flow in a native scroller
- **Source framework evidence:** Arco control classes plus a Tiptap/ProseMirror contenteditable editor
- **Builder status:** source-backed for visual implementation, upload, menu, atomic insertion, option overlays, and submit states

Resolved provenance: commits `f43c499` and `e300926` preserved an earlier in-app browser timeout. The authenticated OpenCLI session later supplied real DOM, CSSOM, screenshots, and interactions; the old blocking statements are superseded.

## Screenshots

| State | Local source evidence | SHA-256 |
| --- | --- | --- |
| Desktop empty | `docs/design-references/ark-video-composer-desktop.png` (`1440 × 900`) | `b07de7f4d93dd81f03c0aa3b580322bbe81ab9dc8735132523341a764491d7da` |
| Tablet empty | `docs/design-references/ark-video-composer-tablet.png` (`768 × 1024`) | `258f490da5012b57deea1ebec3ddc462b88b309d498ba8a3e3ca551f65fcca12` |
| Mobile empty/clipped | `docs/design-references/ark-video-composer-mobile.png` (`390 × 844`) | `ce187a1ad38e0b94523e6b2bd6123d698c6d7972c188cbf73ddf1c381c17ced3` |
| Reference added | `docs/design-references/ark-video-composer-reference-added.png` (`1440 × 900`) | `dd7221e16b1141483ea6cbf971bf32514e1e6a43df6d567b3da46196c8ba4ebc` |
| Mention menu | `docs/design-references/ark-video-composer-mention-menu.png` (`1440 × 900`) | `199aef922f4984f1d206985b808e6157c273aedec9471b042b986686315d55a0` |
| Atomic reference inserted | `docs/design-references/ark-video-composer-reference-inserted.png` (`1440 × 900`) | `9d214626d91e426899e98bf22e6e96bec7a9d98dea04eda072e438fa886555c2` |

## DOM Structure

The bounded live hierarchy is:

```html
<form class="aml-arco-form ... agentic-sender agentic-shell-lwLNKC">
  <div class="input-row-c_D7ti">
    <div class="uploader-slot-zclRZA">
      <div data-testid="stacked-reference-uploader">
        <div class="flyout-FKuUMh ...">
          <div class="scroll-wrap-Brx6K6">
            <div class="row-v1i0Ul">
              <div data-testid="video-sender-reference-media-uploader">
                <ul>
                  <li class="wrapper-TxAYAb">
                    <div class="item-Qrqf6d">
                      <!-- uploaded image frame, img, 图片1 overlay -->
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <button data-testid="stacked-reference-trigger" aria-label="上传参考文件">
          <!-- inline plus SVG -->
        </button>
      </div>
    </div>
    <div class="prompt-slot-_8JjXg">
      <div class="ark-sender-richTextArea ...">
        <div class="tiptap ProseMirror" contenteditable="true" role="textbox">
          <p class="ark-sender-richTextArea-paragraph">
            让
            <span class="react-renderer node-mediaTagSlot"
                  contenteditable="false" draggable="true">
              <span data-node-view-wrapper contenteditable="false" draggable="true">
                <span style="display:inline-flex;align-items:center;vertical-align:middle;line-height:0;cursor:grab">
                  <span class="ark-sender-mediaTag ark-sender-mediaTag-imageTag">
                    <img class="ark-sender-mediaIcon">
                    <span class="ark-sender-mediaTag-label">@图片1</span>
                  </span>
                </span>
              </span>
            </span>
            挥手
          </p>
        </div>
      </div>
    </div>
  </div>
  <div class="actions-row-dm34Mw">
    <div class="primary-slot-HpIhb3">
      <div role="combobox">参考生成</div>
      <div data-testid="video-sender-ratio-resolution-config-dropdown">
        智能比例 / 720P / 5秒 / 1条 / 有声
      </div>
      <button class="triggerButton-bW4rqY">@</button>
    </div>
    <div class="submit-slot-G9_diN">
      <button class="clear-all-button-rVxGU5">全部清空</button>
      <div class="aml-arco-statistic">0.046元/千 tokens</div>
      <button data-testid="video-sender-submit-button" type="button">
        <!-- inline upward-arrow SVG -->
      </button>
    </div>
  </div>
</form>
```

Empty-state variation:

- `stacked-reference-uploader` has `wrapper-empty-mwy5cP`.
- It contains the one hidden file input and the `参考内容` upload tile.
- The thumbnail list, plus button, standalone `@` trigger, and clear-all button are absent.
- The editor shows guidance and the submit button is disabled.

## Computed Styles

All values in this section are direct `getComputedStyle()` results at `1280 × 723`.

### Form shell

```css
display: flex;
flex-direction: column;
box-sizing: border-box;
width: 880px;
height: 152px;
min-width: 0px;
min-height: 0px;
padding: 16px;
background-color: rgb(255, 255, 255);
border: 1px solid rgb(224, 224, 235);
border-radius: 16px;
box-shadow: rgba(0, 0, 0, 0.04) 0px 1px 3px 0px;
overflow: hidden;
font-size: 14px;
font-weight: 400;
line-height: 21px;
color: rgb(11, 11, 15);
```

### Rows

```css
/* input row */
width: 846px;
height: 78px;
display: flex;
flex-direction: row;
row-gap: 12px;
column-gap: 16px;
align-items: flex-start;

/* actions row */
width: 846px;
height: 28px;
display: flex;
margin: 12px 0 0;
gap: 8px;
justify-content: space-between;
align-items: center;
```

### Reference tile

- Uploader wrapper: `86 × 78px`, `position:relative`, `flex-shrink:0`.
- Reference scroll container: `82 × 78px`, `display:flex`, `gap:6px`, radius `10px`, `overflow:auto hidden`.
- List item: `78 × 78px`, `position:relative`, `z-index:3`.
- Tile: `78 × 78px`, `position:relative`, radius `12px`, `cursor:grab`.
- Image: `76 × 76px`, `object-fit:cover`, `object-position:50% 50%`; uploaded source has natural size `941 × 928`.
- `图片1` label: `64 × 16px`, `"PingFang SC" 11px/16px`, letter-spacing `0.033px`, white, ellipsis.
- Add button: `24 × 24px`, absolute, `z-index:21`, `#F6F7FA`, `1px solid white`, radius `100px`.

### Prompt editor

```css
/* prompt slot */
width: 744px;
height: 72px;
display: flex;
flex: 1 1 0%;
gap: 12px;
cursor: text;

/* scroll shell */
width: 744px;
height: 78px;
min-height: 78px;
padding: 6px 0 0;
margin: -6px 0 0;
overflow: hidden auto;

/* editor */
width: 744px;
height: 52px;
min-height: 52px;
position: relative;
white-space: break-spaces;

/* paragraph */
height: 26px;
margin: 0;
font-size: 15px;
font-weight: 400;
line-height: 26px;
white-space: pre-wrap;
```

### Atomic mention

- Outer node: `84.0781 × 26px`, inline-block, `padding-right:3px`, `margin-left:3px`, `contenteditable=false`, draggable.
- Node-view wrapper: `81.0781 × 24px`, inline-block, `vertical-align:top`.
- Alignment wrapper: `81.0781 × 22px`, inline-flex, centered, `line-height:0`, `cursor:grab`.
- Pill: `73.0781 × 22px`, flex, `gap:4px`, `margin:0 4px`, radius `4px`.
- Image: `20 × 20px`, radius `4px`, `object-fit:cover`.
- Label: `49.0781 × 22px`, `"PingFang SC" 15px/22px`, letter-spacing `0.045px`, `#6C7191`.

### Bottom controls

| Element | Exact computed values |
| --- | --- |
| Primary slot | `600.5 × 28px`; flex; gap `8px`; `overflow:auto hidden` |
| Mode combobox | `110 × 28px`; `position:relative`; pointer cursor |
| Parameter trigger | `244.734 × 28px`; `padding:0 10px`; `1px solid #E0E0EB`; radius `6px`; `14px/22px` |
| Mention trigger | `28 × 28px`; centered flex; white; `1px solid #E1E4F2`; radius `6px` |
| Clear-all | `81.1562 × 28px`; `padding:0 8px`; gap `4px`; transparent; `12px/18px #787C91` |
| Price | `120.344 × 28px`; `padding:0 8px`; `13px/28px #6E718C` |
| Ready submit | `28 × 28px`; `#5252FF`; white; radius `9999px`; opacity `1`; pointer |
| Disabled submit | `28 × 28px`; `#ACB4FF`; opacity `0.5`; `cursor:not-allowed` |

## States and Behaviors

### Empty reference / disabled submit

- One upload tile reads `参考内容`.
- The editor displays the verbatim usage guidance.
- Submit has `disabled=true`, opacity `0.5`, background `#ACB4FF`, and `cursor:not-allowed`.

### Uploaded reference / ready submit

- Uploading the authorized PNG creates one thumbnail labeled `图片1` and a 24px overlapping plus button.
- `全部清空` and the standalone `@` trigger appear.
- Submit becomes `disabled=false`, opacity `1`, background `#5252FF`, and pointer cursor.
- Source evidence showed readiness immediately after accepted upload, before textual prompt entry.

### Mention menu open

- Trigger: type `@` in the editor with one reference available.
- Portal: direct child of `body`, class `react-renderer`, `position:absolute`, `160 × 103px`, `z-index:9999`.
- Panel: white, `1px solid #F0F2FA`, radius `12px`, overflow hidden, two-part shadow.
- Tabs: `全部` selected and `图片` unselected.
- Sole item: `图片1`, class includes `active-Ae7A0B`, `142 × 48px`, `padding:6px`, `gap:8px`, background `#F7F7F9`, radius `4px`.
- Item thumbnail: `36 × 36px`, radius `6px`.

### Mention inserted

- Exact editor text: `让 @图片1 挥手`.
- Exact document shape: plain text, one atomic non-editable draggable node, plain text.
- The menu closes after selection.
- Clicking the mention leaves the editor active and adds `aml-arco-popover-open` to its inner wrapper.
- One Backspace immediately after the atomic node did not remove it.

### Mode menu

- Trigger: click the combobox.
- `aria-expanded` changes to `true`.
- Options: `参考生成` selected, `首尾帧`, `版权IP生成`.
- Each option is `40px` high with `13px/22px` type.
- Selected option is `#5252FF` on `#EDEFFC`; unselected options are `#0B0B0F` on white.

### Parameter menu

- Trigger: click `[data-testid=video-sender-ratio-resolution-config-dropdown]`.
- Portal layer is `z-index:1000`.
- Content is `497 × 355px`, `padding:12px 3px 12px 12px`, white, `1px solid #E0E0EB`, radius `8px`, with the same two-part `5%` black shadow used by source popovers.
- Current trigger values are `智能比例`, `720P`, `5秒`, `1条`, `有声`.
- Full choices are recorded in `docs/research/BEHAVIORS.md`.

### Hover

No computed-property change was observed for the ready submit, mention trigger, parameter trigger, or clear-all button across background, border, shadow, opacity, transform, ink, and cursor. Keep the declared transitions; add no scale or shadow effect.

### Clear-all

- Source-visible state: available after upload with exact label `全部清空` and the style above.
- Source click result: not exercised so the inserted-reference evidence remained intact.
- Local clone behavior should clear local reference/editor state without calling Ark or a generation endpoint; this is the safe local product contract, not a claim about an unobserved Ark transition.

### Submit

- Never invoke Ark generation during automated visual testing.
- Clone testing stops at Dry-run/readiness.
- The source submit received no click during reconnaissance.

### Scroll and time

- Form is `position:static` and moves with the Ark content scroller.
- Scroll container uses `scroll-behavior:auto` and `scroll-snap-type:none`.
- Time-driven state: N/A.

## Per-State Content

### Empty/default

```text
参考内容
使用@可快速引用上传的文件，如：参考@视频1中的动作，生成@图片2和@图片3中的角色打斗的视频。
参考生成
智能比例
720P
5秒
1条
有声
0.046 元/千 tokens
```

### Reference added

```text
参考内容
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

### Mention menu

```text
让 @
全部
图片
图片1
```

### Mention inserted

```text
让 @图片1 挥手
```

## Assets

- Local reference asset: `/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png`, `86,673` bytes.
- Use that local file for the clone's fixture/preview; do not copy the expiring signed Ark upload URL.
- Uploaded image natural dimensions as decoded by Ark: `941 × 928`.
- Tile and mention crops both use `object-fit:cover`.
- Upload, plus, parameter, clear, `@`, and submit glyphs are inline SVG in the source DOM. Recreate them as local SVG components; no hotlink is required.
- Video/audio/canvas assets inside the clone boundary: N/A.
- Layered background imagery inside the clone boundary: N/A.

## Responsive Behavior

### Desktop `1440 × 900`

- Full composer visible in one centered row group.
- The source CSS form remains `880 × 152px` at the live desktop geometry.
- Prompt guidance remains one line.
- Submit stays at the far right.

### Tablet `768 × 1024`

- Full form remains visible in the narrowed main surface.
- Prompt guidance wraps to two lines.
- Uploader stays left; controls and submit remain visible on one bottom row.
- Exact raster border runs are `x=219…692` at `y=275` and `y=408`.

### Mobile `390 × 844`

- Ark does not collapse its full page to the viewport.
- Composer begins at `x=280`; only its left portion is visible.
- Right edge, price, and submit are off-screen; a horizontal scrollbar is visible.
- Visible composer border runs are `x=295…380` at `y=319` and `y=452`.

### Breakpoint

No numeric breakpoint is derived from the three source captures. Implement and test the exact outcomes at `1440`, `768`, and `390` widths. When the clone is rendered without Ark's global chrome, keep the component internally usable; page-level Ark clipping belongs to the excluded shell.

## Non-applicable Template Sections

- Scroll-triggered style transition: N/A.
- Time-driven animation: N/A.
- Video, audio, canvas, Lottie, or layered-image composition: N/A.
- Remote backend, authentication, gallery, and history behavior: N/A and outside the clone boundary.
