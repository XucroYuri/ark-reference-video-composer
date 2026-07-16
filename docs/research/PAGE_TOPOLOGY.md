# Page Topology

## Clone boundary

The only cloned section is the live form:

```css
form.agentic-sender
```

Exact source classes:

```text
aml-arco-form aml-arco-form-horizontal aml-arco-form-size-undefined agentic-sender agentic-shell-lwLNKC
```

At the live `1280 × 723` viewport its boundary is `x=390,y=275,width=880,height=152`. Ark global navigation, model header, left history rail, gallery/library, floating support controls, authentication/account surfaces, footer, and private service calls are outside the clone.

The earlier partial commits `f43c499` and `e300926` recorded a browser timeout. OpenCLI later exposed this exact boundary and resolved that evidence gate.

## Exact bounded source hierarchy

```text
form.agentic-sender
├── div.input-row-c_D7ti                         846 × 78
│   ├── div.uploader-slot-zclRZA                 86 × 78
│   │   └── div[data-testid=stacked-reference-uploader]
│   │       ├── div.flyout-FKuUMh                z-index 20
│   │       │   └── div.scroll-wrap-Brx6K6
│   │       │       └── div.row-v1i0Ul
│   │       │           └── div[data-testid=video-sender-reference-media-uploader]
│   │       │               └── ul
│   │       │                   └── li.wrapper-TxAYAb
│   │       │                       └── div.item-Qrqf6d
│   │       │                           ├── image frame + uploaded img
│   │       │                           └── label overlay: 图片1
│   │       └── button[data-testid=stacked-reference-trigger] 24 × 24, z-index 21
│   └── div.prompt-slot-_8JjXg                    744 × 72
│       └── div
│           └── div.flex.items-start.overflow-hidden
│               └── div.ark-sender-richTextArea  744 × 78
│                   └── div.tiptap.ProseMirror[contenteditable=true][role=textbox]
│                       └── p.ark-sender-richTextArea-paragraph
│                           ├── text: "让 "
│                           ├── span.node-mediaTagSlot[contenteditable=false][draggable=true]
│                           │   └── span[data-node-view-wrapper]
│                           │       └── inline-flex wrapper
│                           │           └── span.ark-sender-mediaTag-imageTag
│                           │               ├── img.ark-sender-mediaIcon
│                           │               └── span.ark-sender-mediaTag-label: @图片1
│                           └── text: " 挥手"
└── div.actions-row-dm34Mw                        846 × 28
    ├── div.primary-slot-HpIhb3                   flexible, horizontal-scroll capable
    │   ├── div.mode-selector-container-NwAm0U
    │   │   └── div[role=combobox]: 参考生成      110 × 28
    │   ├── span.anchor-AJe3oz
    │   │   └── div[data-testid=video-sender-ratio-resolution-config-dropdown]
    │   │       └── selected values              244.734 × 28
    │   └── div
    │       └── button.triggerButton-bW4rqY: @   28 × 28
    └── div.submit-slot-G9_diN                    237.5 × 28
        ├── div.secondary-slot-t31jQy
        │   └── div.secondary-action-container-VvZr1W
        │       ├── button.clear-all-button-rVxGU5: 全部清空
        │       └── div.aml-arco-statistic: 0.046元/千 tokens
        └── button[data-testid=video-sender-submit-button] 28 × 28
```

Empty state keeps the same two-row form but replaces the reference list with the `参考内容` upload tile, omits `全部清空` and the standalone `@` trigger, and renders submit disabled.

## Flow and overlay layers

| Layer | Source behavior |
| --- | --- |
| Ark conversation scroller | `#exp-studio-conversation-sender-scroll-container`; normal vertical scroll; no snap |
| Composer shell | Normal flow, `position:static`; moves with its scroller |
| Thumbnail item | `position:relative`; `z-index:3` |
| Uploader flyout | `position:absolute`; `z-index:20` |
| Overlapping add button | `position:absolute`; `z-index:21` |
| Parameter popover | Body portal; Ark overlay `z-index:1000` |
| Mention menu | Body-level `.react-renderer`; `position:absolute`; `z-index:9999` |
| Annotation layer | N/A. The old red-arrow crop was replaced and no annotations belong to the clone. |

The menu overlays the editor and may overlap the page heading. It is not clipped by the form's `overflow:hidden` because it is portaled under `body`.

## Interaction model

The composer is mixed pointer/keyboard state, not scroll- or time-driven:

- Pointer: upload/add reference, mode listbox, parameter popover, `@` trigger, clear-all, submit.
- Keyboard/editor: prompt entry, `@` suggestion activation, atomic media reference, caret movement.
- Scroll: only moves the entire flow form within Ark's content scroller.
- Time-driven behavior: N/A in the cloned boundary.

State dependencies:

```text
local reference state ─┬─> uploader tile/list
                       ├─> @ trigger and mention-menu items
                       ├─> clear-all visibility
                       └─> submit readiness

editor document ───────┬─> placeholder vs prompt
                       ├─> @ suggestion portal
                       └─> atomic media-tag nodes

generation options ────┬─> compact trigger labels
                       ├─> parameter popover selection
                       └─> displayed token price
```

## Responsive topology

- Desktop `1440 × 900`: Ark rail and main surface coexist; the full composer is visible.
- Tablet `768 × 1024`: the left rail collapses to icons, the main surface narrows, the prompt wraps, and the full composer remains visible.
- Mobile `390 × 844`: Ark preserves a wider rail/main layout. In the source capture the main surface begins at `x=228`; the composer begins at `x=280` and extends past the viewport. The right half, including submit, is clipped; a horizontal scrollbar appears.

The clone must use the composer boundary only. If page-level Ark chrome is omitted, do not reproduce its mobile horizontal offset; within a pixel-fidelity full-page comparison, the observed `390px` source clipping is authoritative.
