# 行为取证记录

本文记录源站 Composer 的关键交互行为。后续维护者可以用它判断：某个行为是源站真实行为、原型补齐行为，还是明确不在范围内。

## 1. 取证边界

- 源站页面：`https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`
- 登录状态：已登录。
- 取证工具：OpenCLI 浏览器插件、本地浏览器 QA。
- 取证文件：`docs/design-references/`。
- 成本约束：取证过程中没有点击真实生成按钮，没有创建视频任务，没有产生生成费用。

源站页面中可稳定定位到：

- 一个视频生成表单；
- 一个文件上传 input；
- 一个 `contenteditable=true` 且 `role=textbox` 的 Tiptap 编辑器；
- 一个提交按钮；
- 上传后出现的 `@` 菜单和 `@图片1` 原子节点。

## 2. 上传参考素材

源站行为：

1. 点击 `参考内容` 上传入口。
2. 选择本地图片。
3. 上传成功后显示一个缩略图，标签为 `图片1`。
4. 缩略图右下角出现叠加加号，用于继续追加素材。
5. 独立 `@` 按钮和 `全部清空` 出现。
6. 提交按钮进入可用样式。

本地原型行为：

- 通过 Element Plus Upload 选择文件。
- 服务端校验 MIME、文件签名、大小、尺寸和可解码性。
- 返回素材 ID、预览 URL、文件名、大小和状态。
- 前端用稳定 `realIndex` 显示 `图片1`。

浏览器 QA 备注：

- Chrome 自动化上传本地文件时被扩展权限拦截。
- 已通过本地 API 上传同一张图，再用 development-only `qaMedia` seed 复现“已上传成功”状态。
- 后续 `@` 菜单、编辑器、Dry-run 都走真实 UI 交互。

## 3. `@` 菜单与素材插入

源站行为：

1. 编辑器获得焦点。
2. 输入 `@`。
3. 编辑器中临时出现 suggestion 标记。
4. 菜单打开，首个素材项立即处于 active 状态。
5. 按 `Enter` 后插入 `@图片1`。
6. 插入后的节点是不可编辑、可拖拽的原子节点，而不是普通文本。

原型行为：

- 使用 Tiptap suggestion 监听 `@`。
- 菜单候选项来自 `store.mediaList` 中的 ready 素材。
- `Enter` 插入 `mediaMention` 节点。
- `mediaMention` 节点 attrs 保存：

```js
{
  mediaId: '<uuid>',
  kind: 'image',
  sourceLabel: '图片1',
  realIndex: 1,
  previewUrl: '/uploads/<uuid>.png'
}
```

序列化时不会信任 `sourceLabel`，而是按服务端权威素材和稳定顺序重新生成标签。

## 4. 删除、撤销、重做

源站行为：

- 光标在原子节点后方时，单次 Backspace 不一定直接删除节点。
- 选中完整原子节点后，节点 class 会包含 `ProseMirror-selectednode`。
- 选中节点再 Backspace，会删除整个 `@图片1`。
- 删除 mention 后，上传素材仍保留。
- `全部清空` 会同时清空编辑器和参考素材。

原型 QA 中验证：

- 删除原子节点后，文本变为 `让  挥手`。
- 撤销恢复 `让 @图片1 挥手`。
- 重做再次删除 mention。
- `全部清空` 后：
  - `mediaList` 为空；
  - 编辑器为空；
  - placeholder 恢复；
  - 提交按钮禁用；
  - 无可见任务面板。

## 5. 参数选择

源站参数：

| 组 | 选项 |
| --- | --- |
| 比例 | 智能比例、16:9、9:16、1:1 |
| 清晰度 | 720P、1080P |
| 时长 | 5秒、10秒 |
| 条数 | 1条、2条、3条、4条 |
| 声音 | 有声、无声 |

原型默认值：

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

浏览器 QA 验证项：

- 将声音改成 `无声`。
- 保持 `720P / 5秒 / 1条`。
- Dry-run 最终请求包含 `"generate_audio": false`。

## 6. 提交与成本边界

源站真实提交按钮在取证中未点击。

原型提交按钮默认只做 Dry-run：

```text
POST /api/videoGeneration/dryRun
```

Dry-run 验证：

- 不调用 Ark。
- 不创建真实任务。
- 不消耗费用。
- 返回最终 API 请求体和阻塞项。

真实生成只能通过预览抽屉中的显式确认进入：

```text
POST /api/videoGeneration/createTask
```

必须满足：

- `APP_REAL_GENERATION_ENABLED=true`
- `ARK_API_KEY` 存在于服务端
- 素材 URL 是公开 HTTPS 或 Ark 资产
- 当前 Dry-run 返回有效一次性确认 token

## 7. Submit 可用性

源站观察：

| 状态 | disabled | 背景 | 透明度 | 鼠标 |
| --- | --- | --- | --- | --- |
| 空态 | `true` | `#ACB4FF` | `0.5` | `not-allowed` |
| 已上传素材 | `false` | `#5252FF` | `1` | `pointer` |
| 已输入 `让 @图片1 挥手` | `false` | `#5252FF` | `1` | `pointer` |
| 删除 mention 但保留素材 | `false` | `#5252FF` | `1` | `pointer` |

实现策略：提交可用性来自“有 ready 素材或提示词非空”，与源站“上传后可提交”的行为一致。

## 8. Hover 行为

源站对以下元素做了 hover 取证：

- ready submit；
- 独立 `@` trigger；
- 参数 trigger；
- `全部清空`。

观察结果：背景、边框、阴影、透明度、transform、文字色和 cursor 都没有可见计算值变化。实现中保留基础 transition，不额外增加浮起或缩放。

## 9. 清空行为

点击源站 `全部清空` 后：

- 编辑器恢复空文档；
- 参考素材数量为 `0`；
- 缩略图数量为 `0`；
- mention 数量为 `0`；
- 独立 `@` trigger 消失；
- `全部清空` 消失；
- 提交按钮禁用；
- 文件 input 清空。

原型已按该语义实现：`store.clearDraft()` 会重置素材、编辑器、参数、Dry-run 结果、任务列表和索引计数。

## 10. 响应式行为

| 视口 | 源站行为 |
| --- | --- |
| `1440 × 900` | Composer 完整可见。 |
| `768 × 1024` | Composer 仍完整可见，提示词可换行。 |
| `390 × 844` | 方舟外壳不做移动端重排，页面横向裁剪，提交按钮在屏幕外。 |

原型只复刻 Composer，不复刻方舟整页横向偏移；因此移动端全页对比中的左右位置差异不判为缺陷。

## 11. 不在范围内的行为

- 方舟模板库/图库加载。
- 真实任务结果展示瀑布流。
- 登录、账号、权限和计费。
- 源站私有 BFF 协议。
- 方舟图片预览 tooltip 的完整交互细节。
- 真实付费生成自动化验证。

## 12. 对测试的要求

至少覆盖：

- 上传成功后显示 `图片1`。
- `@` 菜单插入原子节点。
- 序列化输出三层提示词和 `image_url`。
- Dry-run 不调用 Ark。
- 删除素材时同步清理对应 mention。
- 真实生成确认 token 错误时不调用 createTask。
- createTask 不自动重试。
- 轮询只查询已有任务，不重新创建任务。
