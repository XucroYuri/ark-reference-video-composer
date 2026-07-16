# Design Tokens

## Evidence status

**Source-backed and ready for the composer build.** Values in the computed-style tables came from `getComputedStyle()` in the authenticated OpenCLI session `ark-recon` on the exact Ark page. Geometry was captured at the live `1280 × 723` viewport; the responsive notes come from real `1440 × 900`, `768 × 1024`, and `390 × 844` screenshots.

The earlier in-app browser API timed out and produced the partial evidence commits `f43c499` and `e300926`. That gate is resolved: OpenCLI exposed one form, one file input, one contenteditable textbox, live CSSOM, and all requested screenshots. The former annotated `979 × 167` crop was replaced by a real `1440 × 900` reference-added capture.

## Composer shell

| Property | Exact source value |
| --- | --- |
| Source selector | `form.agentic-sender` |
| Source classes | `aml-arco-form aml-arco-form-horizontal aml-arco-form-size-undefined agentic-sender agentic-shell-lwLNKC` |
| Rendered box at `1280 × 723` | `x=390`, `y=275`, `880 × 152` px |
| `display` / direction | `flex` / `column` |
| `width` / `height` / `min-height` | `880px` / `152px` / `0px` |
| Padding | `16px` on all sides |
| Background | `rgb(255, 255, 255)` / `#FFFFFF` |
| Border | `1px solid rgb(224, 224, 235)` / `#E0E0EB` |
| Radius | `16px` |
| Shadow | `rgba(0, 0, 0, 0.04) 0px 1px 3px 0px` |
| Overflow | `hidden` on both axes |
| Base ink | `rgb(11, 11, 15)` / `#0B0B0F` |

## Internal layout

| Element | Exact source value |
| --- | --- |
| Input row | `846 × 78px`; `display:flex`; row direction; `row-gap:12px`; `column-gap:16px`; `align-items:flex-start` |
| Uploader slot | `86 × 78px`; `flex-shrink:0` |
| Prompt slot | `744 × 72px`; `flex:1 1 0%`; `cursor:text` |
| Rich-text scroll shell | `744 × 78px`; `min-height:78px`; `padding:6px 0 0`; `margin:-6px 0 0`; `overflow:hidden auto` |
| Editor | `744 × 52px`; `min-height:52px`; `position:relative`; `white-space:break-spaces` |
| Paragraph | `744 × 26px`; `margin:0`; `font:400 15px/26px`; `white-space:pre-wrap` |
| Actions row | `846 × 28px`; `margin-top:12px`; `display:flex`; `gap:8px`; `justify-content:space-between`; `align-items:center` |
| Primary controls slot | `600.5 × 28px`; `display:flex`; `gap:8px`; `overflow:auto hidden` |
| Submit slot | `237.5 × 28px`; `display:flex`; `gap:4px`; `flex-shrink:0`; `max-width:max-content` |

## Typography

The base stack is:

```css
Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ByteSans,
Arial, "Helvetica Neue", -apple-system, "system-ui", "noto sans",
Helvetica, sans-serif
```

| Role | Font / ink |
| --- | --- |
| Composer base | `400 14px/21px`, `#0B0B0F` |
| Prompt paragraph | `400 15px/26px`, `#0B0B0F` |
| Reference label | `"PingFang SC"`, `400 11px/16px`, letter-spacing `0.033px`, `#FFFFFF` |
| Mention label | `"PingFang SC"`, `400 15px/22px`, letter-spacing `0.045px`, `rgb(108, 113, 145)` / `#6C7191` |
| Clear-all | `"PingFang SC"`, `400 12px/18px`, letter-spacing `0.036px`, `rgb(120, 124, 145)` / `#787C91` |
| Price | `400 13px/28px`, `rgb(110, 113, 140)` / `#6E718C` |
| Menu tabs | `13px/20px`; selected weight `500`, unselected weight `400` |
| Menu item label | `"PingFang SC"`, `400 15px/22px`, `#090911` |
| Placeholder raster ink | `#B8BAC9` in the empty-state source capture |

## Reference uploader

| Element | Exact source value |
| --- | --- |
| Uploaded-media scroll area | `82 × 78px`; `display:flex`; `gap:6px`; `border-radius:10px`; `overflow:auto hidden` |
| Media list item | `78 × 78px`; `position:relative`; `z-index:3`; transition `transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)` |
| Media tile | `78 × 78px`; `position:relative`; `border-radius:12px`; `cursor:grab` |
| Thumbnail | `76 × 76px`; natural source `941 × 928`; `object-fit:cover`; `object-position:50% 50%` |
| Overlay label | `64 × 16px`; `overflow:hidden`; `text-overflow:ellipsis`; `white-space:nowrap` |
| Add button | `24 × 24px`; absolute at live `x=471,y=342`; background `#F6F7FA`; `1px solid #FFFFFF`; radius `100px`; `z-index:21` |
| Add-button shadow | `rgba(31,35,41,.03) 0 1.833px 1.833px, rgba(31,35,41,.05) 0 1.375px 1.375px, rgba(31,35,41,.03) 0 2.75px 4.125px` |

## Controls and states

| Control | Geometry and style |
| --- | --- |
| Mode selector | `110 × 28px`; combobox; pointer cursor |
| Parameter trigger | `244.734 × 28px`; `padding:0 10px`; `1px solid #E0E0EB`; radius `6px`; `font-size:14px`; `line-height:22px`; transition `0.2s` |
| `@` trigger | `28 × 28px`; white; `1px solid #E1E4F2`; radius `6px`; centered flex |
| Clear-all | `81.1562 × 28px`; `padding:0 8px`; `gap:4px`; transparent; radius `6px` |
| Price | `120.344 × 28px`; `padding:0 8px`; `white-space:nowrap` |
| Submit, ready | `28 × 28px`; `#5252FF`; white ink; radius `9999px`; opacity `1`; pointer cursor |
| Submit, disabled | `28 × 28px`; `rgb(172, 180, 255)` / `#ACB4FF`; opacity `0.5`; `cursor:not-allowed` |
| Submit transition | `0.1s linear` |

Ready-state hover checks on submit, `@`, parameters, and clear-all produced no computed-property diff for background, border, shadow, opacity, or transform. Preserve the source transitions above without inventing extra hover movement.

## Atomic mention token

| Layer | Exact source value |
| --- | --- |
| Atomic node | `<span class="react-renderer node-mediaTagSlot" contenteditable="false" draggable="true">` |
| Atomic box | `84.0781 × 26px`; inline-block; `padding-right:3px`; `margin-left:3px` |
| Node-view wrapper | `81.0781 × 24px`; inline-block; `vertical-align:top` |
| Inner alignment wrapper | `81.0781 × 22px`; `display:inline-flex`; `align-items:center`; `vertical-align:middle`; `line-height:0`; `cursor:grab` |
| Pill | `73.0781 × 22px`; `display:flex`; `gap:4px`; `margin:0 4px`; radius `4px`; `white-space:nowrap` |
| Mention thumbnail | `20 × 20px`; radius `4px`; `object-fit:cover`; overflow hidden |
| Mention label | `49.0781 × 22px`; text `@图片1`; color `#6C7191` |

## Overlay tokens

### Mention menu

- Portal: `position:absolute`, `160 × 103px`, `z-index:9999`.
- Panel: white; `1px solid #F0F2FA`; radius `12px`; overflow hidden.
- Shadow: `rgba(0,0,0,.05) 0 15px 35px -2px, rgba(0,0,0,.05) 0 5px 15px 0`.
- Tabs: `158 × 37px`; `padding:8px 12px 0`; `gap:12px`.
- Items region: `158 × 64px`; `padding:8px`; overflow hidden.
- Active item: `142 × 48px`; `padding:6px`; `gap:8px`; `#F7F7F9`; radius `4px`.
- Menu thumbnail: `36 × 36px`; radius `6px`; object is the uploaded image.

### Parameter popover

- Portal layer: `z-index:1000`.
- Content: `497 × 355px`; `padding:12px 3px 12px 12px`; white; `1px solid #E0E0EB`; radius `8px`.
- Shadow: `rgba(0,0,0,.05) 0 15px 35px -2px, rgba(0,0,0,.05) 0 5px 15px 0`.
- Content typography: `400 12px/18.4615px`, `#0B0B0F`.

### Mode dropdown

- Each option is `40px` high with `13px/22px` type.
- Selected `参考生成`: `#5252FF` on `#EDEFFC`.
- Unselected options: `#0B0B0F` on white.

## Responsive source behavior

| Capture | Direct evidence |
| --- | --- |
| `1440 × 900` | Full composer and submit are visible. Exact `#DBDBE7` raster border runs: top `x=405…1254,y=275`; bottom `x=405…1254,y=426`. |
| `768 × 1024` | Full composer remains visible in the narrowed main surface. Border runs: top `x=219…692,y=275`; bottom `x=219…692,y=408`. Prompt wraps to two lines; controls remain one row. |
| `390 × 844` | Ark does not reflow to the viewport. The page is horizontally clipped; the composer starts at `x=280`, only its left portion is visible, and its right edge and submit are off-screen. Visible border runs are `x=295…380` at `y=319` and `y=452`; a horizontal scrollbar is visible. |

No breakpoint is asserted from three snapshots. The faithful clone contract is the observed behavior at those exact widths, including Ark's clipping at `390px`.
