# 视频生成 Composer 组件规格

本文是实现 `src/view/videoGeneration/` 的组件契约。后续修改 UI、编辑器或请求结构时，先对照本文确认不要破坏源站语义。

## 1. 基本信息

| 项 | 内容 |
| --- | --- |
| 装配入口 | `src/view/videoGeneration/index.vue` |
| 子组件 | `ReferenceMediaPanel.vue`、`PromptComposer.vue`、`MediaSuggestionMenu.vue`、`GenerationOptionsBar.vue`、`RequestPreviewDrawer.vue`、`GenerationTaskPanel.vue` |
| 源站标题 | 火山方舟 - 体验 |
| 源站地址 | `https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128` |
| 复刻边界 | 只复刻 `form.agentic-sender` 这一块 Composer |
| 交互模型 | 指针 + 键盘；普通文档流；非滚动驱动、非定时动画 |
| 技术依据 | 源站使用 Arco 控件样式 + Tiptap/ProseMirror contenteditable 编辑器 |

早期 in-app browser 取证曾超时；后续 OpenCLI/浏览器插件已拿到真实 DOM、CSSOM、截图和交互证据，旧超时记录不再是阻塞项。

## 2. 源站截图依据

| 状态 | 文件 | 尺寸 |
| --- | --- | --- |
| 桌面空态 | `docs/design-references/ark-video-composer-desktop.png` | `1440 × 900` |
| 平板空态 | `docs/design-references/ark-video-composer-tablet.png` | `768 × 1024` |
| 移动端空态/裁剪 | `docs/design-references/ark-video-composer-mobile.png` | `390 × 844` |
| 已上传参考图 | `docs/design-references/ark-video-composer-reference-added.png` | `1440 × 900` |
| `@` 菜单 | `docs/design-references/ark-video-composer-mention-menu.png` | `1440 × 900` |
| 已插入 `@图片1` | `docs/design-references/ark-video-composer-reference-inserted.png` | `1440 × 900` |

最终实现对比：

- `docs/design-references/ark-composer-comparison-desktop.png`
- `docs/design-references/ark-composer-comparison-mobile.png`

## 3. 目标 DOM 结构

实现不需要复制源站 class 名，但必须保留以下结构语义：

```text
Composer 页面
├── 标题：体验视频生成，让创意摇动
├── 表单 shell
│   ├── 输入行
│   │   ├── ReferenceMediaPanel
│   │   │   ├── 空态：参考内容上传 tile
│   │   │   └── 已上传：缩略图列表 + 图片N 标签 + 叠加加号
│   │   └── PromptComposer
│   │       ├── 空态 placeholder
│   │       ├── Tiptap ProseMirror 编辑器
│   │       └── mediaMention 原子节点
│   └── 操作行
│       ├── GenerationOptionsBar
│       │   ├── 模式：参考生成
│       │   └── 参数：比例 / 清晰度 / 时长 / 条数 / 声音
│       ├── 独立 @ 触发按钮
│       ├── 全部清空
│       ├── 价格：0.046 元/千 tokens
│       └── 提交 Dry-run 按钮
├── GenerationTaskPanel
└── RequestPreviewDrawer
```

空任务状态不渲染 `GenerationTaskPanel`；只有提交中或存在真实任务记录时才显示。

## 4. 尺寸和布局要求

| 区域 | 要求 |
| --- | --- |
| Composer shell | 基准宽度约 `880px`，白底，`16px` 圆角，浅色边框，隐藏溢出。 |
| 输入行 | 上传区固定宽度；编辑器占剩余空间；顶部对齐。 |
| 上传 tile | 约 `78 × 78px`；缩略图圆角；右下叠加加号。 |
| 操作行 | 高度约 `28px`；左侧参数控件，右侧清空/价格/提交。 |
| 参数 trigger | 紧凑展示 `智能比例 720P 5秒 1条 有声/无声`。 |
| 提交按钮 | 圆形；可用态紫色，禁用态浅紫并降低透明度。 |

源站在 `390px` 宽度下不做移动端重排，而是发生横向裁剪。原型可以不复刻方舟外壳偏移，但 Composer 自身应保持最小宽度和横向裁剪语义。

## 5. ReferenceMediaPanel 规格

职责：

- 负责展示参考素材空态和已上传列表。
- 负责调用 `store.uploadMedia(file)`。
- 负责本地上传中 preview。
- 删除按钮只发出 remove 事件，具体删除和 mention 清理由 store/page 处理。

关键行为：

- 仅接受 `image/png`、`image/jpeg`、`image/webp`。
- 单文件最大 `30MB`。
- ready 素材显示 `图片${realIndex}`。
- 上传中显示 `上传中`。
- 删除已被提示词引用的素材前，需要确认。

迁移提示：

- 在 `hc-gpt-web` 中可以继续使用 Element Plus Upload。
- 正式上传服务应由后端返回素材 ID 和预览 URL，前端不要自己生成真实生成 URL。

## 6. PromptComposer / mediaMention 规格

`@图片1` 必须是 Tiptap 原子节点，而不是普通字符串。

节点属性：

```js
{
  mediaId: '素材 ID',
  kind: 'image',
  sourceLabel: '图片1',
  realIndex: 1,
  previewUrl: '/uploads/<uuid>.png'
}
```

显示行为：

- 编辑器内展示为 `@图片1` pill。
- 节点不可编辑。
- 节点参与撤销/重做。
- `@` 菜单没有 ready 素材时不应插入无效 mention。

删除行为：

- 删除素材时，store 通过 `removeMentionsByMediaId` 清理文档中对应节点。
- 删除 mention 不删除素材。
- `全部清空` 同时清理素材和编辑器。

## 7. MediaSuggestionMenu 规格

打开条件：

- 编辑器中输入 `@`；
- 至少存在一个 ready 素材。

菜单内容：

- 分类 tab 目前保留 `全部` 和 `图片`。
- 每个候选项展示缩略图和 `图片N`。
- 打开时首个候选项可被键盘选中。

实现要求：

- 菜单 Teleport 到 `body`，避免被 Composer shell 裁剪。
- 点击或键盘确认后插入 `mediaMention` 节点。
- stale suggestion 会话要能退出，避免引用旧 query 或旧列表。

## 8. GenerationOptionsBar 规格

默认配置：

```js
{
  mode: 'reference_media',
  ratio: 'adaptive',
  resolution: '720p',
  duration: 5,
  count: 1,
  generateAudio: true
}
```

允许值：

| 字段 | 允许值 |
| --- | --- |
| `ratio` | `adaptive`、`16:9`、`9:16`、`1:1` |
| `resolution` | `720p`、`1080p` |
| `duration` | `5`、`10` |
| `count` | `1`、`2`、`3`、`4` |
| `generateAudio` | `true`、`false` |

参数 popover 使用原生 select，原因是：

- 键盘可操作；
- 测试稳定；
- 迁移成本低；
- 不依赖 Ark 私有下拉组件。

## 9. RequestPreviewDrawer 规格

Dry-run 预览必须展示：

- 可读提示词；
- 控制台兼容模板；
- 模型规范文本；
- 媒体映射；
- 最终 API 请求；
- 真实生成阻塞项；
- 复制 JSON 按钮；
- 满足真实生成条件时才显示/允许确认真实生成。

真实生成按钮必须受这些条件保护：

- `result.realReady === true`
- 当前 `confirmationToken` 非空
- 用户显式点击确认

前端即使隐藏/禁用按钮，服务端仍必须再次校验。

## 10. GenerationTaskPanel 规格

任务面板只负责展示真实任务状态：

- `submitting`
- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

空任务时不显示面板。这是最终视觉 QA 中修复的 P2 问题。

成功任务如果包含 `content.video_url`，显示 `<video controls>`。该 URL 必须是 HTTPS，store 会拒绝非 HTTPS 成功结果。

## 11. 序列化契约

输入：

```js
{
  doc,
  mediaList,
  config,
  model
}
```

输出：

```js
{
  readablePrompt: '让 @图片1 挥手',
  templatePrompt: '让 <<<image_1_1>>> 挥手',
  modelPrompt: '让 【图片 1】 挥手',
  media: [
    {
      id: '<mediaId>',
      realIndex: 1,
      canonicalIndex: 1,
      url: 'local://<mediaId>',
      notPublic: true
    }
  ]
}
```

最终 Ark 请求：

```js
{
  model: 'doubao-seedance-2-0-260128',
  content: [
    { type: 'text', text: '让 【图片 1】 挥手' },
    {
      type: 'image_url',
      role: 'reference_image',
      image_url: { url: '...' }
    }
  ],
  ratio: 'adaptive',
  resolution: '720p',
  duration: 5,
  generate_audio: false
}
```

序列化规则：

- `canonicalIndex` 按文档首次出现顺序计算。
- 没有出现在文档里的素材排在已引用素材之后。
- 缺失素材不静默吞掉，要进入 errors/blockers。
- 非图片素材不生成 `image_url`。
- 本地 URL 标记 `notPublic`，真实生成前必须阻塞。

## 12. 成本与安全要求

- 自动化测试和浏览器 QA 只能走 Dry-run。
- 不允许在测试中调用真实 Ark。
- `ARK_API_KEY` 只能在服务端读取。
- 不允许创建 `VITE_ARK_API_KEY`。
- Ark 错误响应必须脱敏。
- createTask 不自动重试。
- 真实生成 token 必须一次性消费。
- 查询轮询只查询已有任务，不创建新任务。

## 13. 测试覆盖要求

至少覆盖：

- 默认控件和文案；
- 上传显示 `图片1`；
- `@` 原子节点插入；
- 参数修改；
- Dry-run 预览，不创建付费任务；
- 清空重置；
- 删除引用素材前确认；
- 空任务面板隐藏；
- 任务状态展示；
- serializer 的顺序、缺失素材、重复 realIndex、非公开 URL；
- store 的并发保护、stale response 保护、轮询和 token 保护。

## 14. 已知后续增强

- 完整复刻点击 `@图片1` 后的图片预览 tooltip。
- 进一步缩小 standalone 页面与源站外壳缺失造成的视觉差异。
- 接入正式素材 CDN 后，补一次低成本真实生成验证。
