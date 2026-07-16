# 页面拓扑与复刻边界

本文记录源站页面的结构边界，供后续维护者判断哪些差异属于 Composer 组件问题，哪些差异来自已经明确排除的方舟控制台外壳。

## 1. 复刻范围

本 MVP 只复刻视频生成输入组件，也就是源站中的表单区域：

```css
form.agentic-sender
```

源站该表单的完整 class：

```text
aml-arco-form aml-arco-form-horizontal aml-arco-form-size-undefined agentic-sender agentic-shell-lwLNKC
```

在源站 `1280 × 723` 视口下，该组件边界为：

```text
x = 390
y = 275
width = 880
height = 152
```

以下内容不属于复刻范围：

- 方舟顶部导航；
- 模型选择栏；
- 左侧导航和历史记录；
- 版权库/模板库/素材库/虚拟人图库；
- 浮动客服和反馈按钮；
- 登录、账号、权限、计费页面；
- 方舟私有 BFF 请求。

早期取证中 in-app browser 曾超时；后续通过 OpenCLI/浏览器插件拿到了稳定源站证据，该问题已关闭。

## 2. 源站组件层级

已插入 `@图片1` 时，源站 Composer 的核心层级如下：

```text
form.agentic-sender
├── div.input-row-c_D7ti                         846 × 78
│   ├── div.uploader-slot-zclRZA                 86 × 78
│   │   └── div[data-testid=stacked-reference-uploader]
│   │       ├── div.flyout-FKuUMh                z-index:20
│   │       │   └── div.scroll-wrap-Brx6K6
│   │       │       └── div.row-v1i0Ul
│   │       │           └── div[data-testid=video-sender-reference-media-uploader]
│   │       │               └── ul
│   │       │                   └── li.wrapper-TxAYAb
│   │       │                       └── div.item-Qrqf6d
│   │       │                           ├── 上传缩略图
│   │       │                           └── 覆盖标签：图片1
│   │       └── button[data-testid=stacked-reference-trigger] 24 × 24
│   └── div.prompt-slot-_8JjXg                    744 × 72
│       └── div.ark-sender-richTextArea
│           └── div.tiptap.ProseMirror[contenteditable=true][role=textbox]
│               └── p.ark-sender-richTextArea-paragraph
│                   ├── text: "让 "
│                   ├── span.node-mediaTagSlot[contenteditable=false][draggable=true]
│                   │   └── span.ark-sender-mediaTag-imageTag
│                   │       ├── 缩略图
│                   │       └── label: @图片1
│                   └── text: " 挥手"
└── div.actions-row-dm34Mw                        846 × 28
    ├── div.primary-slot-HpIhb3
    │   ├── 模式选择：参考生成
    │   ├── 参数选择：智能比例 / 720P / 5秒 / 1条 / 有声
    │   └── 独立 @ 触发按钮
    └── div.submit-slot-G9_diN
        ├── 全部清空
        ├── 价格：0.046 元/千 tokens
        └── 提交按钮
```

空状态保持同一个两行布局，但有这些差异：

- 参考图列表替换成 `参考内容` 上传 tile；
- 隐藏 `全部清空`；
- 隐藏独立 `@` 触发按钮；
- 提交按钮禁用。

## 3. 层叠与浮层

| 层级 | 源站行为 | 原型处理 |
| --- | --- | --- |
| Ark 内容滚动容器 | 普通垂直滚动，无 scroll-snap | 不复刻外壳，只保留组件自身滚动/裁剪语义。 |
| Composer shell | 普通文档流，`position:static` | standalone 页面居中展示。 |
| 上传缩略图 | `position:relative; z-index:3` | 保持缩略图和覆盖标签。 |
| 上传加号 | 绝对定位，覆盖缩略图右下角，`z-index:21` | 保持重叠加号。 |
| 参数面板 | body portal，Ark overlay 约 `z-index:1000` | Element Plus popover，禁用远端依赖。 |
| `@` 菜单 | body 级浮层，`z-index:9999` | Tiptap suggestion 菜单 Teleport 到 body，避免被表单裁剪。 |
| 图片预览 tooltip | 点击 `@图片1` 出现预览 panel | MVP 未强制实现，该项为后续 P3 增强。 |

## 4. 交互模型

Composer 是键盘和指针混合驱动，不是滚动驱动或定时动画驱动：

- 指针交互：上传/追加参考图、模式选择、参数选择、独立 `@`、全部清空、提交。
- 键盘交互：提示词输入、`@` 菜单激活、方向键/Enter 插入素材、删除/撤销/重做。
- 滚动行为：只跟随页面滚动；组件内部不依赖滚动触发状态。
- 定时行为：源组件无自动切换或定时动画。

状态依赖关系：

```text
参考素材列表
├── 决定上传 tile / 缩略图列表
├── 决定 @ 菜单候选项
├── 决定独立 @ 触发按钮是否出现
├── 决定全部清空是否出现
└── 参与提交可用性判断

Tiptap 文档
├── 决定 placeholder 是否显示
├── 承载 mediaMention 原子节点
├── 驱动 Dry-run 序列化
└── 删除素材时需要清理对应 mention

生成参数
├── 显示在紧凑参数 trigger 中
├── 进入 Dry-run 请求体
└── 参与真实生成确认范围
```

## 5. 响应式拓扑

| 视口 | 源站表现 | 原型要求 |
| --- | --- | --- |
| `1440 × 900` | 左侧导航和主区域同时可见，Composer 完整显示。 | 组件完整显示；外壳差异忽略。 |
| `768 × 1024` | 左侧导航折叠为图标，主区域变窄，提示词换行，控件仍在一行。 | 组件内部保持可用。 |
| `390 × 844` | 方舟整页保留宽布局，主区域从 `x=228` 开始，Composer 从 `x=280` 开始并横向裁剪，提交按钮在屏幕外。 | standalone 原型保留组件最小宽度和横向裁剪，不复刻方舟外壳偏移。 |

移动端对比时必须注意：源站截图中的大量差异来自方舟外层布局，不是 Composer 组件本身。

## 6. 对实现的约束

- 不要把 `@图片1` 做成普通文本；必须是原子节点。
- 不要让 `@` 菜单被 Composer 的 `overflow:hidden` 裁掉。
- 不要因为 standalone 页面没有图库和导航就扩大复刻范围。
- 不要在视觉测试中点击真实生成。
- 不要把本地 `/uploads` 或 `local://` 当作真实生成可用 URL。
- 空任务状态不应显示额外面板；任务面板只在提交中或已有真实任务时出现。
