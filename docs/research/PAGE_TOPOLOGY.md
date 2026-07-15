# Page Topology

## Clone boundary

The only cloned section is the marked video-generation composer shown in `docs/design-references/ark-video-composer-reference-added.png`. Ark navigation, gallery, authentication, account chrome, page title area, history, and private BFF behavior are outside the clone boundary.

The exact source DOM selector and source element hierarchy are unavailable because DOM inspection timed out. The boundary is therefore defined visually: the rounded pale-violet frame and everything inside it, excluding the external red annotation arrows.

## Screenshot-derived visual hierarchy

```text
video composer frame
├── upper content row
│   ├── reference thumbnail tile
│   │   ├── thumbnail image
│   │   ├── lower overlay label: 图片1
│   │   └── overlapping add chip: +
│   └── prompt/editor guidance
│       └── inline example references: @视频1, @图片2, @图片3
└── bottom control row
    ├── reference mode control: 参考生成
    ├── grouped parameters
    │   ├── 智能比例
    │   ├── 720P
    │   ├── 5秒
    │   ├── 1条
    │   └── 有声
    ├── standalone @ control
    ├── flexible spacer
    ├── 全部清空
    ├── 0.046 元/千 tokens
    └── circular upward-arrow submit affordance
```

This is a visual containment map, not a claim about source tags, classes, component names, or CSS layout primitives.

## Flow and overlay layers

1. The outer rounded frame is the component background/border layer.
2. The thumbnail and prompt occupy the upper visual row.
3. The compact controls occupy the lower visual row.
4. The add chip visibly overlaps the reference tile and must render above the thumbnail.
5. The `图片1` strip overlays the thumbnail's lower edge.
6. A future mention suggestion menu would be an overlay above editor and controls, but no Ark menu screenshot or z-index value is available.
7. The red arrows belong to the supplied annotation layer and must not appear in the clone.

Exact `position`, flex/grid properties, stacking-context boundaries, and numeric `z-index` values are unavailable. Only the visible front-to-back relationships above are source-backed.

## Interaction model

- Visual affordances indicate a mixed pointer-and-keyboard composer: reference addition, parameter selection, clear-all, an `@` shortcut, and submit are visibly exposed.
- The guidance explicitly describes `@` references, establishing that `@视频1`, `@图片2`, and `@图片3` are meaningful editor references.
- Trigger events, atomic mention semantics, focus behavior, deletion behavior, menu keyboard navigation, transitions, and submit enablement were not live-verified.
- No scroll-driven or time-driven behavior is visible inside the cropped composer. A source sweep is still required before declaring either category absent.

## Section dependencies

- The clone may depend on local upload state, prompt/editor document state, generation options, price presentation, and Dry-run preview state.
- It must not depend on Ark navigation, authentication UI, gallery, history, or private endpoints.
- Jimeng screenshots are retained beside the Ark crop as comparative evidence for the cross-product `@` affordance; they are not topology truth for Ark.
