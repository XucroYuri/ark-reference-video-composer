# Design Tokens

## Evidence policy

- Ark visual source: `docs/design-references/ark-video-composer-reference-added.png`.
- That image is a cropped, annotated `979 × 167` raster of one reference-added state. Red arrows are review annotations and are not Ark UI.
- Jimeng screenshots are comparative interaction evidence only. They are not used for Ark colors, spacing, typography, or dimensions.
- The in-app browser opened the exact Ark URL, but DOM and screenshot operations timed out. No `getComputedStyle()` result is available. Values below are either exact raster measurements, exact sampled raster colors, or explicitly labeled visual observations.

## Raster-measured geometry

Coordinates are inclusive and refer to the Ark crop's top-left origin.

| Item | Measured evidence |
| --- | --- |
| Evidence canvas | `979 × 167` px |
| Composer visible border | `x=16…975`, `y=10…161`; `960 × 152` px inclusive border bounds |
| Outer corner transition | The straight top border starts at `x=31`; the straight left border starts at `y=25`, a `15` px raster corner transition |
| Reference tile occupied region | `x=34…119`, `y=27…104`; `86 × 78` px including the overlapping add chip |
| Reference-generation control | `x=33…142`, `y=117…144`; `110 × 28` px |
| Grouped parameter control | `x=151…395`, `y=117…144`; `245 × 28` px |
| Standalone `@` control | `x=404…431`, `y=117…144`; `28 × 28` px |
| Submit fill | `x=931…958`, `y=117…144`; `28 × 28` px circular fill |
| Horizontal control gaps | `8` px between reference-generation and parameters; `8` px between parameters and `@` |
| Frame insets at control row | `17` px from left border to first control; `17` px from control bottom to lower border |

The composer CSS width and `min-height` are unavailable. The table records the supplied raster, not a browser viewport or CSS box.

## Raster-sampled colors

| Role | Ark raster value | Evidence note |
| --- | --- | --- |
| Composer background | `#FFFFFF` | Dominant interior pixel color |
| Outer and grouped-control border | `#E0E0EB` | Exact solid stroke pixels |
| Standalone `@` control border | `#E1E4F2` | Exact solid stroke pixels |
| Purple accent | `#5252FF` | Exact submit-button fill |
| Add-chip background | `#F6F7FA` | Exact solid fill at `x=98…119`, `y=78…99` |
| Primary control-label ink | `#3F3F52` | Solid glyph-core pixels in the bottom control row |
| Placeholder ink | `#B8BAC9` | Solid glyph-core pixels in the prompt guidance |
| Shadow/edge antialiasing | `#FCFCFC`, `#FAFAFA`, `#F9F9F9` are present | Composited raster tones; no CSS shadow declaration is available |
| Annotation red | `#F22B24` | External arrows; exclude from implementation |

Secondary, hover, and disabled CSS color tokens are unavailable because those states were not captured and computed CSS could not be read. The visible price and clear-all labels use muted cool-gray ink, but their CSS colors are not asserted from antialiased raster pixels.

## Visual observations without computed CSS

- The composer is white, rounded, and bordered in pale violet-gray, with a very light outer shadow.
- The reference thumbnail is portrait-oriented in a rounded tile. A translucent lower label reads `图片1`; a round add chip overlaps the tile's lower-right edge.
- The prompt guidance is regular-weight CJK sans-serif in a light cool gray. Font family, font size, font weight, line height, and letter spacing are unavailable as CSS values.
- Bottom controls are compact outlined pills/rectangles aligned on one `28` px-high raster row. CSS padding and radii are unavailable; the measured row dimensions and gaps above are authoritative for this crop.
- The submit control is a purple circle with a white upward arrow. The screenshot alone does not establish whether this is a ready or disabled state.
- Thumbnail `object-fit`, crop position, border radius, and source asset URL are unavailable from the raster. The image visibly fills its portrait tile.

## Responsive evidence

| Planned viewport | Source evidence |
| --- | --- |
| Desktop `1440 × 900` | Unavailable: in-app browser screenshot interaction timed out |
| Tablet `768 × 1024` | Unavailable: in-app browser viewport/screenshot interaction timed out |
| Mobile `390 × 844` | Unavailable: in-app browser viewport/screenshot interaction timed out |

No breakpoint, wrapping rule, mobile padding, or minimum width is asserted. Task 10 must re-attempt all three source captures before treating responsive values as Ark-exact.
