# Behaviors

## Task 1 gate

**Status: BLOCKED — incomplete and not builder-ready.** The missing live behavior evidence gates downstream pixel-fidelity builder work. The partial screenshot package may be retained for provenance, but it is not sufficient to implement or approve Ark-exact interactions.

## Source access and safety outcome

- Controller-verified page title: `火山方舟 - 体验`.
- Controller-verified URL: `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`.
- The exact Ark tab could be opened in the selected in-app browser, but every DOM and screenshot interaction timed out.
- The local reference file `/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png` exists and is `86,673` bytes.
- No live upload was performed. The prompt was not edited, the submit/generate control was not clicked, no Ark task was created, and no generation cost was incurred.

## Mandatory interaction sweep

| Sweep | Result |
| --- | --- |
| Scroll | Unavailable — blocking: DOM/interaction timeout prevented a controlled source sweep |
| Click | Unavailable — blocking: no source control was clicked, preserving the no-cost boundary |
| Hover | Unavailable — blocking: pointer interaction timed out |
| Keyboard | Unavailable — blocking: the editor could not be focused or typed into safely |
| Responsive | Unavailable — blocking at `1440 × 900`, `768 × 1024`, and `390 × 844` because viewport/screenshot interaction timed out |

## Ark state evidence

The authoritative Ark crop records one state only: a reference thumbnail labeled `图片1` is present, the prompt area still shows guidance, and the bottom control row is visible.

Verbatim visible guidance:

```text
使用@可快速引用上传的文件，如：参考@视频1中的动作，生成@图片2和@图片3中的角色打斗的视频。
```

Verbatim visible control/value copy:

```text
图片1
参考生成
智能比例
720P
5秒
1条
有声
全部清空
0.046 元/千 tokens
@
```

## Required state matrix

| State | Evidence status |
| --- | --- |
| Empty reference | Unavailable — blocking: no default-state Ark capture |
| Uploaded/reference-added | Visually captured: portrait thumbnail, `图片1` label, overlapping add chip |
| `@` menu closed | Not established; a standalone `@` control is visible, but menu state cannot be inferred |
| `@` menu open | Unavailable — blocking: no Ark suggestion-menu capture |
| `@` menu keyboard-selected | Unavailable — blocking: no controlled keyboard session |
| Mention inserted | Unavailable — blocking: guidance contains example `@` text, not an inserted editor node |
| Mention focused | Unavailable — blocking |
| Mention deleted | Unavailable — blocking |
| Parameter menu open | Unavailable — blocking |
| Parameter selected | Visible values are `智能比例`, `720P`, `5秒`, `1条`, and `有声`; menu mechanics were not tested |
| Empty prompt | The editor displays guidance; source document emptiness was not inspectable |
| Valid prompt | Unavailable — blocking |
| Disabled submit | Unavailable — blocking: the purple circle's semantic state cannot be inferred from color alone |
| Ready submit | Unavailable — blocking: the purple circle's semantic state cannot be inferred from color alone |
| Clear-all | `全部清空` is visible; its click result was not tested |
| Default form copy `参考内容` | Unavailable — blocking: it is not visible in the supplied reference-added crop and could not be live-verified |

## Corroborating Jimeng evidence

- `docs/design-references/jimeng-image-generation-mention-affordance.png` visibly combines a reference thumbnail, a prompt hint containing a boxed `@`, compact parameter controls, and a circular submit affordance.
- `docs/design-references/jimeng-video-generation-mention-affordance.png` visibly combines a reference thumbnail, the hint `使用 @ 快速调用参考内容，例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1`, compact video controls, and a circular submit affordance.
- These images corroborate the broad upload-plus-mention interaction pattern only. They do not establish Ark menu contents, Ark atomic-node behavior, Ark keyboard rules, Ark colors, or Ark layout values.

## Blocking recovery obligations

- Downstream Ark pixel-fidelity builder work is gated. Product requirements and Jimeng patterns cannot replace missing Ark source behavior evidence.
- Task 10 must re-attempt default, mention-menu, inserted/focused/deleted mention, parameter-menu, hover, keyboard, clear-all, submit-state, `参考内容` form-content, and responsive source evidence in the selected in-app browser.
- Real generation remains outside automated verification. Stop at Dry-run unless the user gives action-time confirmation for a potentially charged Ark task.
