# Video Composer Specification

## Task 1 gate

**Status: BLOCKED — incomplete and not builder-ready.** This file is a partial evidence ledger, not a source-of-truth builder specification. Downstream Ark pixel-fidelity builder work is gated until all required source captures, live DOM, computed styles, interactions, and responsive states are captured.

## Overview

- **Planned assembly target:** `src/view/videoGeneration/index.vue`
- **Planned child components:** `ReferenceMediaPanel.vue`, `PromptComposer.vue`, `MediaSuggestionMenu.vue`, `GenerationOptionsBar.vue`
- **Authoritative Ark screenshot:** `docs/design-references/ark-video-composer-reference-added.png`
- **Comparative screenshots:** `docs/design-references/jimeng-image-generation-mention-affordance.png`, `docs/design-references/jimeng-video-generation-mention-affordance.png`
- **Source page title:** `火山方舟 - 体验`
- **Source URL:** `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`
- **Interaction model:** mixed pointer/keyboard affordances are visible; unavailable — blocking: exact source event model
- **Clone boundary:** only the rounded composer; Ark navigation, gallery, authentication, and history are excluded

## Evidence limitation

The selected in-app browser could open the exact Ark tab, but every DOM and screenshot interaction timed out. This specification does not claim live DOM, CSSOM, computed-style, hover, keyboard, menu, or responsive verification. The Ark crop is authoritative only for what it visibly contains. Red arrows are external annotations.

## DOM Structure

**Exact source DOM hierarchy:** Unavailable — blocking: live DOM inspection timed out.

Screenshot-derived visual hierarchy:

```text
composer frame
├── reference area
│   └── reference tile
│       ├── portrait thumbnail
│       ├── 图片1 overlay label
│       └── overlapping + chip
├── prompt/editor guidance
└── control row
    ├── 参考生成
    ├── grouped values: 智能比例 / 720P / 5秒 / 1条 / 有声
    ├── @ shortcut
    ├── flexible space
    ├── 全部清空
    ├── 0.046 元/千 tokens
    └── circular submit affordance
```

Implementation tags, ARIA relationships, classes, and slot boundaries must be chosen by the Vue implementation and must not be described as extracted Ark DOM.

## Computed Styles (exact values from `getComputedStyle()`)

Unavailable — blocking: DOM/CSSOM access timed out, so no `getComputedStyle()` value was obtained.

## Screenshot raster measurements

| Element | Exact evidence in the `979 × 167` Ark raster |
| --- | --- |
| Composer border | `x=16…975`, `y=10…161`; `960 × 152` px inclusive bounds; solid stroke `#E0E0EB` |
| Composer background | `#FFFFFF` |
| Outer corner | `15` px transition between straight top and left border runs |
| Reference tile including add chip | `x=34…119`, `y=27…104`; `86 × 78` px |
| Add-chip fill | `#F6F7FA` |
| Reference-generation control | `x=33…142`, `y=117…144`; `110 × 28` px |
| Parameter group | `x=151…395`, `y=117…144`; `245 × 28` px |
| `@` control | `x=404…431`, `y=117…144`; `28 × 28` px; stroke `#E1E4F2` |
| Submit fill | `x=931…958`, `y=117…144`; `28 × 28` px; fill `#5252FF` |
| Control gaps | `8` px, then `8` px |
| Bottom/left row inset | `17` px from visible frame border |
| Primary/placeholder glyph cores | `#3F3F52` / `#B8BAC9` |

These are raster coordinates and samples, not CSS declarations. Unavailable — blocking: CSS width, minimum height, padding, border radius, box shadow, font family, font metrics, and transitions.

## States & Behaviors

### Captured Ark state: reference added, guidance visible

- A portrait reference thumbnail is present.
- The lower thumbnail overlay reads `图片1`.
- A round `+` chip overlaps the thumbnail.
- Prompt guidance remains visible.
- Selected visible options are `智能比例`, `720P`, `5秒`, `1条`, and `有声`.
- `全部清空`, price copy, a standalone `@` control, and a purple circular submit affordance are visible.

### Required Ark states — unavailable and blocking

- Empty/default reference state: Unavailable — blocking.
- `@图片1` suggestion menu open/closed/keyboard-selected: Unavailable — blocking.
- Mention inserted between `让 ` and ` 挥手`: Unavailable — blocking.
- Mention focused/deleted: Unavailable — blocking.
- Parameter menu open and changed selections: Unavailable — blocking.
- Hover/focus/pressed styles and transitions: Unavailable — blocking.
- Disabled-versus-ready submit mapping: Unavailable — blocking.
- Clear-all result: Unavailable — blocking.
- Default form-content verification for `参考内容`: Unavailable — blocking.

### Hover states

Unavailable — blocking: source hover interaction timed out.

### Scroll-triggered or time-driven states

Unavailable — blocking: a live scroll/time sweep could not be completed, so absence of these behaviors is not established.

### Safety outcome

- No upload was performed during reconnaissance.
- No prompt was typed into Ark.
- Submit/generate was never clicked.
- No Ark task was created and no cost was incurred.

## Per-State Content

### State: reference added with guidance

```text
图片1
使用@可快速引用上传的文件，如：参考@视频1中的动作，生成@图片2和@图片3中的角色打斗的视频。
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

### Other Ark states

Unavailable — blocking: no additional Ark state was captured.

## Assets

- Ark source evidence: `docs/design-references/ark-video-composer-reference-added.png` (`979 × 167`, SHA-256 `2156904440d6999bf9d4dcea340d99136d0149fde232fc189a6694147d321130`).
- Jimeng image comparison: `docs/design-references/jimeng-image-generation-mention-affordance.png` (`1381 × 312`, SHA-256 `f6fe4d28f529555f2e51991ca41d3dc8be40587a740acd74271b7a828e5b02d3`).
- Jimeng video comparison: `docs/design-references/jimeng-video-generation-mention-affordance.png` (`1308 × 336`, SHA-256 `b0c51b4a7e228efce7a0186ec5baa13a1e9f1f525d651af1db3aac8a08e4579d`).
- Authorized local reference: `/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png` (`86,673` bytes); existence verified, not uploaded in this run.
- Source icon/SVG files: Unavailable — blocking: the raster embeds icons, and live asset extraction timed out.
- The red arrows in the Ark crop are annotations, not local UI assets.

## Text Content (verbatim)

```text
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

`参考内容` form-content verification is Unavailable — blocking. It is required by the planned default clone, is not visible in the supplied reference-added crop, and could not be live-verified.

## Responsive Behavior

- **Desktop `1440 × 900`:** Unavailable — blocking: source capture timed out.
- **Tablet `768 × 1024`:** Unavailable — blocking: source viewport/capture timed out.
- **Mobile `390 × 844`:** Unavailable — blocking: source viewport/capture timed out.
- **Breakpoint:** Unavailable — blocking: no Ark breakpoint could be observed.

Downstream responsive and pixel-fidelity builder work is gated until Task 10 obtains the missing Ark source evidence. No product decision or comparative screenshot may substitute for source-responsive truth.

## Comparative interaction evidence

The two Jimeng screenshots show a thumbnail-plus-prompt pattern with an inline/boxed `@` affordance, compact bottom controls, and a circular submit button. This supports the broad product pattern only. Do not copy Jimeng dark-theme colors, dimensions, labels, models, option values, pricing, or layout as Ark truth.

## Task 10 source-evidence re-attempt

Re-capture Ark default desktop, tablet, mobile, and mention-menu states; inspect the live DOM and computed styles; verify all keyboard, hover, click, parameter, mention, clear-all, and submit states; then replace unavailable fields only with directly observed evidence. Do not trigger paid generation.
