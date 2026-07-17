# 方舟参考素材视频生成组件实施计划（中文归档版）

本文是本次 MVP 的实施计划归档，面向后续接手的中文母语开发者。  
当前代码已经完成实现和验证；日常开发优先阅读根目录 [README.md](../../../README.md)、[开发者交接说明](../../开发者交接说明.md) 和 [迁移说明](../../migration/hc-gpt-web.md)。本文件保留“为什么这样拆”和“验收时必须守住什么边界”，不再保留逐行脚手架代码。

## 1. 目标

在项目根目录中交付一个可以直接运行的 Vue 3 MVP，复刻火山方舟 Seedance 2.0 体验页被标注的视频生成输入组件：

- 先通过“参考内容”添加图片素材。
- 在提示词中输入 `@`，只能引用已经添加的素材。
- 引用在编辑器里显示为 `@图片1`、`@图片2` 这类不可拆分标签。
- 提交前稳定序列化为“用户可读提示词 + 模型提示词 + 媒体数组 + Ark API JSON”。
- 默认只走 Dry-run，不触发真实计费任务。
- 真实生成必须经过服务端环境变量、公网素材 URL、Dry-run 成功和一次性确认令牌四道门槛。

## 2. 架构边界

### 2.1 前端

前端刻意对齐 `hc-gpt-web` 的迁移成本：

- Vue 3.3
- JavaScript SFC
- Vite 4
- Element Plus
- Pinia
- Axios
- Hash Router
- `@` 路径别名
- `{ code, data, msg }` 响应包络

业务代码集中在 `src/view/videoGeneration/`，后续迁移到 `hc-gpt-web` 时应尽量原样复制组件、store、序列化器和测试。

### 2.2 本地服务端

Express 只承担原型适配职责：

- 保存本地上传素材。
- 暴露 `/api/videoGeneration/*`。
- 执行 Dry-run 构造和校验。
- 在显式启用时代理 Ark 视频生成任务。

迁移到正式系统时，不应把 Express 当作目标架构；应把这些路由按相同 DTO 移植到 `hc-gpt-server` 的 Gin 分层。

### 2.3 不复刻的部分

以下内容不属于 MVP 范围：

- 火山方舟顶栏、侧栏、模型广场、历史记录和模板瀑布流。
- 控制台私有 BFF、登录态、Cookie 和内部鉴权。
- TOS/Assets 入库。
- 账号系统、计费系统、数据库、多用户协作。
- 自动发起真实视频生成。

## 3. 分阶段实施路线

### 阶段 1：源页面取证与规格冻结

目标是把“看起来像”和“行为正确”拆成可验证材料。

交付物：

- `docs/design-references/ark-video-composer-desktop.png`
- `docs/design-references/ark-video-composer-tablet.png`
- `docs/design-references/ark-video-composer-mobile.png`
- `docs/design-references/ark-video-composer-reference-added.png`
- `docs/design-references/ark-video-composer-mention-menu.png`
- `docs/research/DESIGN_TOKENS.md`
- `docs/research/BEHAVIORS.md`
- `docs/research/PAGE_TOPOLOGY.md`
- `docs/research/components/video-composer.spec.md`

验收重点：

- 只克隆被标注的生成组件，不扩展到控制台壳层。
- 记录桌面、平板、移动端布局。
- 记录上传素材、`@` 菜单、mention 插入、参数条、提交前预览等关键状态。
- 明确哪些结论来自浏览器取证，哪些是 Ark 公开 API 边界下的合理推断。

### 阶段 2：搭建可运行骨架

目标是先让项目具备 `hc-gpt-web` 风格的最小运行环境。

交付物：

- `package.json`
- `.env.example`
- `.env.development`
- `vite.config.js`
- `vitest.config.js`
- `scripts/serve.mjs`
- `src/main.js`
- `src/App.vue`
- `src/router/index.js`
- `src/pinia/index.js`
- `src/utils/request.js`
- `src/view/videoGeneration/index.vue`

验收重点：

- `npm run serve` 可以同时启动前端和本地 API。
- 路由固定为 `/#/video-generation`。
- 前端请求路径统一走 `/api` 代理。
- 项目结构后续能低成本迁移进 `hc-gpt-web`。

### 阶段 3：请求构造与安全边界

目标是先把 `@图片N` 的语义和 Ark 请求边界做成纯函数，避免 UI 先行造成状态混乱。

交付物：

- `src/view/videoGeneration/utils/buildArkRequest.js`
- `src/view/videoGeneration/types.js`
- 相关单元测试

核心约束：

- `@图片N` 不是最终后端协议，只是 UI 展示和用户心智。
- 编辑器内部 mention 节点必须携带 `mediaId`、`kind`、`sourceLabel`、`realIndex`。
- 序列化时按编辑器顺序生成：
  - `readablePrompt`
  - `templatePrompt`
  - `modelPrompt`
  - `mediaMapping`
  - `arkRequest`
- 删除素材后不能留下悬空 mention。
- 没有公网素材 URL 时，Dry-run 可以展示阻断原因，真实生成必须阻断。

### 阶段 4：服务端 API 适配

目标是让原型可以完整走通“上传素材 → Dry-run → 可选真实创建 → 轮询任务”的后端边界。

交付物：

- `server/index.js`
- `server/routes/videoGeneration.js`
- `server/media/store.js`
- `server/ark/client.js`
- `server/ark/requestBuilder.js`
- `server/tasks/taskStore.js`
- 服务端契约测试

验收重点：

- 所有响应都使用 `{ code, data, msg }`。
- 默认 Dry-run 绝不调用 Ark。
- `ARK_API_KEY` 只存在服务端环境，不进入前端、日志、快照或截图。
- 真实生成必须同时满足：
  - `APP_REAL_GENERATION_ENABLED=true`
  - `ARK_API_KEY` 存在
  - 所有素材具备公网 URL
  - Dry-run 成功
  - 一次性确认令牌有效
- 创建任务不自动重试，避免重复付费。

### 阶段 5：前端数据层

目标是将上传素材、编辑器文档、参数配置、任务状态统一放入 Pinia，降低组件耦合。

交付物：

- `src/api/videoGeneration.js`
- `src/view/videoGeneration/store/index.js`
- store 测试

状态设计重点：

- `mediaList` 保存素材真实身份。
- `realIndex` 一经分配不因删除其他素材而重排。
- `editorDoc` 保存 Tiptap JSON，是提示词唯一真相来源。
- `config` 默认值与源页面一致：智能比例、720P、5 秒、1 条、有声。
- `dryRunResult` 和 `task` 分开存放，防止预览状态污染真实任务状态。

### 阶段 6：Tiptap 原子 mention 编辑器

目标是正确处理中文输入法、Selection、撤销栈、复制粘贴和原子删除。

交付物：

- `src/view/videoGeneration/editor/mediaMention.js`
- `src/view/videoGeneration/editor/mediaSuggestion.js`
- `src/view/videoGeneration/components/PromptComposer.vue`
- `src/view/videoGeneration/components/MediaSuggestionMenu.vue`
- 编辑器测试

实现重点：

- mention 节点必须是 `inline + atom`。
- 节点展示文本为 `@图片N`。
- 节点属性必须包含素材身份，不依赖文本反查。
- `@` 菜单只列出 `ready` 状态素材。
- 没有可用素材时显示“请先添加参考内容”，不插入无效节点。
- Backspace/Delete 一次删除整个 mention。

### 阶段 7：组件组装和视觉还原

目标是复刻被标注组件的主体视觉和核心交互。

交付物：

- `ReferenceMediaPanel.vue`
- `GenerationOptionsBar.vue`
- `RequestPreviewDrawer.vue`
- `GenerationTaskPanel.vue`
- `styles/index.scss`
- 页面级组件测试

验收重点：

- 居中白色卡片、淡紫边框、圆角、紧凑参数条、右侧紫色提交按钮。
- 上传位、提示词编辑区、参数条和价格信息位置接近源页面。
- 移动端不横向溢出，上传、输入和提交仍可操作。
- 预览抽屉清楚展示最终 API JSON 和阻断原因。

### 阶段 8：轮询、文档和迁移说明

目标是把项目从“能跑”整理成“别人能接”。

交付物：

- `README.md`
- `docs/migration/hc-gpt-web.md`
- `docs/开发者交接说明.md`
- 任务轮询测试

验收重点：

- 明确本地启动命令、端口、环境变量和测试命令。
- 明确 Dry-run 与真实生成的差异。
- 明确迁移到 `hc-gpt-web` / `hc-gpt-server` 的文件映射。
- 明确哪些能力是开发辅助，哪些不能进入生产。

### 阶段 9：浏览器验证和视觉 QA

目标是用实际浏览器证明组件可用，且视觉差异已经收口到可接受范围。

交付物：

- `docs/design-references/ark-composer-implementation-desktop.png`
- `docs/design-references/ark-composer-implementation-mobile.png`
- `docs/design-references/ark-composer-comparison-desktop.png`
- `docs/design-references/ark-composer-comparison-mobile.png`
- `design-qa.md`

无成本验证场景：

1. 启动原型。
2. 打开 `/#/video-generation`。
3. 添加一张开发态种子素材或上传本地图片。
4. 输入文本并通过 `@` 插入 `@图片1`。
5. 调整为最低成本参数：720P、5 秒、1 条。
6. 点击提交，只打开 Dry-run 预览。
7. 检查最终 JSON，不点击真实生成。

验收重点：

- 浏览器控制台无运行时错误。
- Dry-run 结果包含正确的文本、媒体映射和 Ark 请求结构。
- 没有发起真实 Ark task 请求。
- `design-qa.md` 最终包含 `final result: passed`。

## 4. 成本和安全红线

- 默认配置必须是 Dry-run。
- 单元测试、组件测试、契约测试、浏览器验证和视觉 QA 都不能调用 Ark。
- 不把 `ARK_API_KEY` 暴露给任何 `VITE_` 变量。
- 不在截图、日志、fixture、测试快照中输出密钥。
- 不自动重试真实任务创建。
- 如需真实验证，必须人工确认，且只允许最低成本参数：
  - 720P
  - 5 秒
  - 1 条
  - 模型允许时关闭音频

## 5. 最终验收命令

```bash
npm run test
npm run lint
npm run build
```

合并前必须全部退出 `0`。

## 6. 当前归档结论

实现已经完成：

- MVP 可以本地运行。
- `@` 素材引用通过 Tiptap 原子节点实现。
- Dry-run 能稳定展示最终请求结构。
- 真实生成被环境变量和确认令牌保护。
- 视觉 QA 通过，`design-qa.md` 记录为 `final result: passed`。

后续维护应优先改代码和测试，再同步更新中文文档；不要把历史计划当作比当前实现更高优先级的事实来源。
