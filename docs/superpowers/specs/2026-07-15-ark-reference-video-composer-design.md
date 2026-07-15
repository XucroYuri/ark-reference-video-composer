# 方舟参考素材视频生成组件设计规格

**日期：** 2026-07-15

**状态：** 已批准

**目标目录：** `/Users/huachi/Code/03-video-toolkit/Video-Generation-API `

## 1. 目标

创建一个可直接运行的 Vue 3 MVP，忠实复刻火山方舟 Seedance 2.0 体验页中被标注的视频生成输入组件。MVP 的核心是“先通过参考内容上传素材，再在提示词内通过 `@` 插入素材引用”，并将富文本状态稳定序列化成方舟公开视频生成 API 可以理解的文本与媒体数组。

页面默认工作在 Dry-run 模式，不调用付费 API。真实生成只在服务端配置有效凭据、所有媒体具有公网地址且用户完成二次确认时开放。

## 2. 范围

### 2.1 必须实现

- 与源页面一致的居中式视频生成卡片及响应式布局。
- “参考内容”素材选择、上传状态、缩略图、编号和删除。
- 只允许已经加入参考内容的素材出现在 `@` 菜单中。
- 输入 `@` 打开菜单，支持鼠标和键盘选择素材。
- 素材以不可拆分的富文本节点显示为 `@图片1`、`@图片2`。
- 标签前后可继续输入文本，支持光标移动、复制、粘贴、撤销、重做和原子删除。
- 支持多素材、同一素材重复引用，以及删除引用而不删除素材。
- “参考生成”、比例、分辨率、时长、生成条数、有声/无声参数控件。
- 全部清空、字符/素材校验、禁用态、加载态和错误态。
- Dry-run 请求预览：显示用户文本、隐藏模板、模型文本、媒体映射和最终 API JSON。
- 真实任务创建、任务轮询、成功视频展示和失败信息。
- 默认使用 `720p、5 秒、1 条`；真实验证时优先关闭音频以控制成本。

### 2.2 不在首版范围

- 复刻火山方舟的顶栏、侧栏、模型广场、模板瀑布流和历史记录。
- 复刻控制台私有 BFF、登录态、Cookie 或鉴权机制。
- 内置 TOS/Assets API 素材入库。
- 计费系统、账号系统、多人协作、数据库和云端持久化。
- 真人素材认证和资产授权流程。

## 3. 技术选择

- **前端：** Vue 3.3、JavaScript、Vite 4，和 `hc-gpt-web` 当前基线一致。
- **UI：** Element Plus 2，业务组件使用 `<script setup>` 与 scoped SCSS；只用自定义 CSS 微调方舟视觉。
- **富文本：** Tiptap Vue 3 2.1，自定义 `mediaMention` 原子节点和 `@` Suggestion 菜单；直接兼容 `hc-gpt-web` 已有依赖。
- **状态：** Pinia Setup Store，目录和写法对齐 `src/pinia` 及页面局部 store。
- **请求：** Axios API 模块，形状对齐 `src/api/*.js` 与 `@/utils/request`。
- **本地服务端：** Express 4，仅作为原型的可运行适配器，负责本地素材、Dry-run、方舟代理和任务轮询。
- **验证：** Vitest、Vue Test Utils、happy-dom、Express HTTP 契约测试和浏览器交互验证。
- **代码组织：** 单仓库，前端业务代码按 `hc-gpt-web/src/view/<feature>` 组织；共享 DTO 与序列化器使用 JavaScript + JSDoc。

选择 Tiptap 而不是 textarea 覆盖层或原生 `contenteditable`，因为中文输入法、Selection、撤销栈、复制粘贴和原子节点删除是本组件的核心正确性要求。

### 3.1 与 `hc-gpt-web` 的对齐结论

参考仓库当前采用 npm、Vue 3.3、Vite 4、Element Plus、Pinia、Axios、`@` 路径别名、Hash Router、`VITE_BASE_API` 代理和 `{ code, data, msg }` 响应包络。MVP 遵循这些约定，避免迁移时重新改写组件、store 和 API 调用层。

以下内容刻意不复制：登录权限、动态菜单、全局 loading emitter、庞大的全局样式和既有业务 store。原型通过兼容适配层提供同样的 API 入口；迁移到 `hc-gpt-web` 时删除适配层并直接使用现有基础设施。

### 3.2 迁移边界

- 可原样迁移：`src/view/videoGeneration/`、`src/api/videoGeneration.js`、组件测试和请求构造测试。
- 迁移时只需接线：注册 Hash Router 路由和菜单权限，切换到现有 `@/utils/request`。
- 需要后端移植：把原型 Express 的 `/videoGeneration/*` 路由按相同 DTO 移植到 `hc-gpt-server` 的 Gin router/api/service 分层。
- 可直接复用：`hc-gpt-web` 的图片上传、用户 token、模型配置和全局错误消息。

## 4. 页面与组件

页面只有一个主要工作区，视觉上保持方舟源组件的白色背景、淡紫边框、圆角卡片、紧凑参数条和右侧紫色提交按钮。品牌标志、控制台导航和其他无关区域不复制。

### 4.1 `ReferenceMediaPanel`

- 空状态显示“参考内容”上传入口。
- 接受 PNG、JPEG、WebP；单文件不超过 30 MB。
- 上传后显示缩略图、`图片 N` 标签和删除按钮。
- 上传状态：`local`、`uploading`、`ready`、`error`。
- 素材标签基于不可变的上传序号 `realIndex`；删除素材后保留其他素材既有标签，媒体身份始终由 `mediaId` 决定。
- 删除仍被提示词引用的素材时弹出组件内确认；确认后同步删除所有相关 mention 节点。

### 4.2 `PromptComposer`

- Tiptap 文档是提示词的唯一真相来源。
- 自定义节点属性：`mediaId`、`kind`、`sourceLabel`、`realIndex`。
- `@` Suggestion 数据源只读取 `ReferenceMedia` 中 `ready` 素材。
- 菜单支持上下键、Enter、Escape 和鼠标点击。
- mention 节点为 `inline + atom`，Backspace/Delete 一次删除整个标签。
- 无素材时输入 `@` 显示“请先添加参考内容”，不插入无效引用。
- 粘贴普通文本时保留文本；粘贴未知 HTML 时不创建媒体节点。

### 4.3 `GenerationOptionsBar`

- 任务类型：`参考生成`，首版固定但保留可扩展类型。
- 比例：`智能比例`、`16:9`、`9:16`、`1:1`。
- 分辨率：`720p`、`1080p`。
- 时长：`5 秒`、`10 秒`。
- 条数：`1`、`2`、`3`、`4`。
- 音频：`有声`、`无声`。
- 默认值与源组件一致：智能比例、720p、5 秒、1 条、有声。
- 测试成本配置：智能比例、720p、5 秒、1 条、无声。

### 4.4 `RequestPreviewDrawer`

提交按钮默认先打开预览，不直接创建任务。预览包含：

- 可读提示词：`让 @图片1 挥手`。
- 控制台兼容模板：`让<<<image_1_1>>>挥手`。
- 模型规范文本：`让【图片 1】挥手`。
- `mediaId -> 图片 N -> URL/AssetId` 映射。
- 最终 `CreateContentsGenerationsTasks` 请求 JSON。
- 未配置公网 URL 时的阻断原因。
- “仅复制 JSON”和“确认真实生成”两个明确动作。

### 4.5 `GenerationTaskPanel`

- 状态：`idle`、`submitting`、`queued`、`running`、`succeeded`、`failed`、`cancelled`。
- 创建成功后每 3 秒轮询一次；页面隐藏时降低到 10 秒。
- 终态立即停止轮询。
- 成功状态显示视频、任务 ID 和重新生成入口。
- 失败状态显示可读错误、Request ID 和返回编辑入口；不自动重试付费创建。

## 5. 数据模型

```js
/**
 * @typedef {Object} ReferenceMedia
 * @property {string} id
 * @property {'image'|'video'|'audio'} kind
 * @property {string} name
 * @property {number} realIndex
 * @property {string} previewUrl
 * @property {string=} remoteUrl
 * @property {string=} assetId
 * @property {number=} width
 * @property {number=} height
 * @property {string} mimeType
 * @property {number} size
 * @property {'local'|'uploading'|'ready'|'error'} status
 * @property {string=} error
 */

/**
 * @typedef {Object} GenerationConfig
 * @property {'reference_media'} mode
 * @property {'adaptive'|'16:9'|'9:16'|'1:1'} ratio
 * @property {'720p'|'1080p'} resolution
 * @property {5|10} duration
 * @property {1|2|3|4} count
 * @property {boolean} generateAudio
 */
```

Tiptap JSON 保存文本和 `mediaMention` 节点，不另维护一份可变的字符串提示词。

## 6. 序列化规则

序列化函数是纯函数，输入为 Tiptap 文档、素材池和生成参数，输出为 `SerializationResult`。

1. 按提示词中首次出现顺序收集已引用素材并去重，生成从 1 开始的规范化 `canonicalIndex`。
2. 未被 `@` 引用但已加入参考内容的素材追加到媒体数组末尾。
3. 同一素材重复出现时复用同一个媒体编号。
4. 文本节点原样拼接；连续文本节点合并。
5. mention 转换为：
   - 可视文本：`@图片{realIndex}`，保持用户选择时的素材标签。
   - 模板标记：`<<<image_{canonicalIndex}_{realIndex}>>>`。
   - 模型文本：`【图片 {canonicalIndex}】`。
6. 公共 API 的 `content` 第一项为模型文本，后续按规范化顺序追加媒体项。

示例：

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    {
      "type": "text",
      "text": "让【图片 1】挥手"
    },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": {
        "url": "https://example.com/media/xiaodou.png"
      }
    }
  ],
  "resolution": "720p",
  "duration": 5,
  "ratio": "adaptive",
  "generate_audio": true
}
```

控制台私有字段 `RichTextTemplatePrompt` 不发送到公开视频生成 API；模板只用于本地请求预览、调试和文档复现。

公共 API 的单次任务只生成一条结果。`count > 1` 时，服务端在确认页明确展示将创建的付费任务数量，然后顺序创建对应数量的独立任务；任一创建失败即停止剩余创建，不自动补偿或重试。

## 7. API 与安全边界

### 7.1 本地服务端接口

- `POST /videoGeneration/uploadReference`：校验并保存本地参考文件。
- `POST /videoGeneration/deleteReference`：删除本地文件和记录。
- `POST /videoGeneration/dryRun`：验证并返回序列化结果；永不访问方舟。
- `POST /videoGeneration/createTask`：二次确认后创建真实任务。
- `GET /videoGeneration/getTask`：查询并规范化任务状态。
- `POST /videoGeneration/deleteTask`：在方舟 API 支持时取消/删除任务。

所有接口使用 `hc-gpt-web` 已有响应包络：

```json
{
  "code": 0,
  "data": {},
  "msg": "操作成功"
}
```

前端统一由 `src/api/videoGeneration.js` 导出 `uploadReference`、`deleteReference`、`dryRunVideoGeneration`、`createVideoGenerationTask`、`getVideoGenerationTask` 和 `deleteVideoGenerationTask`。除文件上传外，调用方式与 `hc-gpt-web/src/api/nine_grid_video.js` 一致。

原型的 `src/utils/request.js` 保持与目标仓库相同的默认导出和返回包络，但不实现登录跳转；迁移时直接删除该文件并使用 `hc-gpt-web` 现有请求封装。

### 7.2 环境变量

```text
# 前端，与 hc-gpt-web 命名对齐
VITE_CLI_PORT=8080
VITE_SERVER_PORT=8888
VITE_BASE_API=/api
VITE_BASE_PATH=http://127.0.0.1

# 仅服务端读取
ARK_API_KEY=
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=doubao-seedance-2-0-260128
PUBLIC_MEDIA_BASE_URL=
APP_REAL_GENERATION_ENABLED=false
```

`ARK_API_KEY` 只存在于服务端进程。前端接口、日志、错误信息和请求预览均不得返回或记录它。

禁止创建任何 `VITE_ARK_API_KEY` 或其他以 `VITE_` 暴露真实方舟凭据的变量。

### 7.3 公网媒体约束

方舟公开视频生成 API 需要可访问的 HTTPS URL，或已存在的 `asset://<asset-id>`。本地预览 URL 不能用于真实任务。

- Dry-run 可使用本地占位 URI，并明确标注 `not_public`。
- Real 模式要求 `remoteUrl` 为 HTTPS，或 `assetId` 可转换为 `asset://...`。
- `PUBLIC_MEDIA_BASE_URL` 用于把本地上传路径映射到用户自行提供的公网反向代理/对象存储地址。
- 首版不自动创建 TOS 或可信素材资产。

### 7.4 付费保护

真实生成必须同时满足：

1. `APP_REAL_GENERATION_ENABLED=true`。
2. `ARK_API_KEY` 已配置。
3. 所有媒体均可被方舟访问。
4. Dry-run 校验通过。
5. 用户在预览抽屉明确勾选付费确认。
6. 服务端收到一次性确认 token；token 使用后失效。

创建任务失败不自动重试，避免重复扣费。

## 8. 错误处理

- 文件类型、大小或图片解码失败：保留其他素材，错误定位到单个缩略图。
- `@` 引用素材仍在上传：阻止提交并聚焦对应素材。
- 缺少提示词或参考素材：禁用提交并显示具体原因。
- 缺少公网媒体 URL：允许 Dry-run，阻止 Real 模式。
- API Key 缺失：Real 模式入口显示“服务端未启用”，不暴露配置细节。
- 方舟返回 4xx：展示规范化业务错误和 Request ID。
- 方舟返回 5xx/网络异常：允许用户手动重试查询；不自动重建任务。
- 轮询超时：保留任务 ID，允许恢复查询。
- 视频 URL 过期：提示重新查询任务结果。

## 9. 测试与验收

### 9.1 单元测试

- 一个文本节点。
- 一个图片 mention 位于文本中间。
- 多图片顺序和规范化媒体编号稳定。
- 同一图片重复引用只产生一个媒体项。
- 未提及的参考素材追加到末尾。
- 删除引用不删除素材。
- 删除素材清理所有引用。
- 中文、英文、换行和空格不被改写。
- 模板、模型文本和公共 API JSON 快照一致。

### 9.2 组件测试

- 上传 `/Users/huachi/Downloads/参考图/小豆人设/小豆日常/小豆Q版.png` 后出现 `图片1`。
- 输入 `@` 只列出已就绪素材。
- 键盘选择后插入原子节点。
- Backspace 一次删除整个 mention。
- 参数变更实时反映到 Dry-run JSON。
- 全部清空恢复初始状态。
- 未配置真实模式时不会出现可执行的付费按钮。

### 9.3 服务端契约测试

- Dry-run 不产生任何对外网络调用。
- 所有 Express 路由均返回 `{ code, data, msg }`，与 `hc-gpt-web` 请求拦截器兼容。
- 真实模式禁用、缺少 Key、缺少公网媒体时均返回确定错误码。
- 使用模拟方舟服务验证创建、查询、成功和失败状态。
- Authorization 不出现在响应和日志中。
- 一次性确认 token 无法重复使用。

### 9.4 浏览器与视觉验收

- 源页面与实现使用相同桌面视口截图进行并排对比。
- 使用 `390 × 844` 验证移动布局。
- 验证上传、`@` 菜单、参数菜单、预览抽屉、全部清空和任务状态。
- 检查浏览器控制台无错误。
- `design-qa.md` 最终必须为 `final result: passed`。

### 9.5 成本控制

验收顺序：单元测试 → 组件测试 → Dry-run → 模拟 API → 浏览器验证。默认不执行真实生成。只有结构、交互和模拟契约全部通过后，才允许一次 `720p、5 秒、1 条、无声` 的真实任务。

## 10. 文件边界

```text
Video-Generation-API /
├── src/
│   ├── api/
│   │   └── videoGeneration.js
│   ├── pinia/
│   │   └── index.js
│   ├── router/
│   │   └── index.js
│   ├── utils/
│   │   └── request.js
│   └── view/
│       └── videoGeneration/
│           ├── components/
│           │   ├── ReferenceMediaPanel.vue
│           │   ├── PromptComposer.vue
│           │   ├── GenerationOptionsBar.vue
│           │   ├── RequestPreviewDrawer.vue
│           │   └── GenerationTaskPanel.vue
│           ├── editor/
│           ├── store/
│           │   └── index.js
│           ├── utils/
│           │   └── requestBuilder.js
│           ├── __tests__/
│           └── index.vue
├── server/
│   ├── ark/
│   ├── media/
│   ├── routes/
│   └── security/
├── tests/
├── public/
├── docs/
│   ├── research/
│   ├── design-references/
│   └── superpowers/
└── design-qa.md
```

目录命名与 `hc-gpt-web` 的 `src/view`、`src/api`、`src/pinia`、`src/router`、`src/utils` 对齐。页面内复杂状态放在 `src/view/videoGeneration/store/index.js`，不污染全局 store。`requestBuilder.js` 不依赖 Vue、Pinia 或 Express，可直接移入目标仓库并独立测试。

## 11. 完成定义

- `npm install` 后可通过 `npm run serve` 启动前端和本地 Express 适配器。
- `npm run test`、`npm run lint`、`npm run build` 全部通过。
- `package.json`、Vite alias、环境变量、Hash Router 和测试环境与 `hc-gpt-web` 兼容。
- `src/view/videoGeneration` 与 `src/api/videoGeneration.js` 可不改业务逻辑直接复制进 `hc-gpt-web`。
- 本地参考图可上传并通过 `@` 插入提示词。
- Dry-run JSON 与技术解释文档中的结构一致。
- 真实模式默认关闭且不存在密钥泄漏路径。
- 源组件的核心视觉、参数控件和关键交互在桌面及移动端可用。
- 浏览器验证和视觉 QA 通过。
- README 给出启动、环境变量、Dry-run、真实 API 和成本保护说明。

## 12. 已确认决策

- 使用 Vue 3，而不是 AI Website Cloner Template 默认的 Next.js。
- 安装并使用该模板提供的 Codex `clone-website` Skill，但以用户要求的 Vue 3 技术栈覆盖其框架默认值。
- 采用 Tiptap 自定义 mention 节点。
- 采用与 `hc-gpt-web` 一致的 JavaScript SFC、Element Plus、Pinia、Axios 和 npm/Vite 约定。
- 采用 Express 本地适配器；迁移时按相同路由与 DTO 移植到 `hc-gpt-server` Gin 服务。
- 默认 Dry-run；真实生成需显式开启并二次确认。
- 首版不内置 TOS/Assets API。
