# Seedance 2.0 视频生成开源与完整闭环设计规格

**日期：** 2026-07-17

**状态：** 待书面规格复核

**目标仓库：** `XucroYuri/ark-reference-video-composer`

**开源许可：** MIT

## 1. 背景与目标

当前项目已经实现 Vue 3 参考图片 Composer、Tiptap `@图片N` 原子引用、Dry-run、安全确认、Ark 任务创建和单任务轮询，但仍是内部原型形态。它缺少公开仓库材料、公网 URL 素材入口、任务列表、完整 DELETE 交互、`expired` 状态和与 2026 年 7 月官方 API 一致的参数边界。

本阶段将项目整理为一个可公开复用的单仓库参考实现：开发者可以完整阅读前端代码，通过最小 Express 适配层安全地配置服务端密钥，并走通“素材 → Prompt → Dry-run → 付费确认 → 创建 → 查询 → 历史恢复 → 取消或删除”的视频生成生命周期。

最终交付必须满足：

- GitHub 公开仓库 `XucroYuri/ark-reference-video-composer`。
- MIT License。
- 英文主 README 与中文 README。
- Vue 3 完整前端源码和最小安全服务端适配层。
- 四个官方视频生成 API 的规范映射与自动化契约测试。
- 一次明确授权的最低成本真实视频生成验证。
- 不公开密钥、完整任务 ID、临时结果 URL、用户素材或生成视频二进制。

## 2. 官方规范基线

设计和实现以 2026-07-17 阅读到的以下官方文档为准：

- [创建视频生成任务 API](https://www.volcengine.com/docs/82379/1520757)
- [查询视频生成任务 API](https://www.volcengine.com/docs/82379/1521309)
- [查询视频生成任务列表](https://www.volcengine.com/docs/82379/1521675)
- [取消或删除视频生成任务](https://www.volcengine.com/docs/82379/1521720)

官方接口闭环为：

```text
POST   /api/v3/contents/generations/tasks
GET    /api/v3/contents/generations/tasks/{id}
GET    /api/v3/contents/generations/tasks
DELETE /api/v3/contents/generations/tasks/{id}
```

任务只支持查询最近 7 天记录。成功视频和尾帧 URL 的有效期为 24 小时，前端必须明确提示及时下载或转存。

## 3. 对抗性审查结论

现有实现中，创建接口的方法、路径、Bearer 鉴权、JSON Body、单任务查询路径和无自动创建重试原则正确。以下问题阻止项目宣称“完整闭环”：

| 级别 | 缺口 | 设计决策 |
| --- | --- | --- |
| P0 | 未实现任务列表 API | 增加 Ark client、Express、前端 API、Pinia 和任务历史 UI 的完整映射。 |
| P0 | 未识别 `expired` | 加入合法终态，收到后停止轮询并展示超时原因。 |
| P0 | DELETE 无前端入口 | 根据状态呈现“取消”或“删除”，并覆盖竞态失败。 |
| P0 | 失败 UI 读取 `task.message` | 改为读取官方 `error.code` 与 `error.message`。 |
| P0 | 没有公网 URL 素材登记 | 增加服务端权威登记与前端 URL 入口。 |
| P1 | 图片边界宽于 Ark | 强制 1–9 张、300–6000 px、宽高比 0.4–2.5、单张严格小于 30 MB。 |
| P1 | 参数集合停留在旧窄范围 | 按所选 Seedance 2.0 模型更新合法值并共用一份约束。 |
| P1 | 上游 400/429 被统一改写为 502 | 保留安全的上游 HTTP 状态、错误码和 Request ID。 |
| P1 | 没有 7 天/24 小时提示 | 在任务历史和结果区展示有效期说明及下载入口。 |
| P1 | 页面硬编码 token 单价 | 删除硬编码价格，改为“实际费用以方舟控制台为准”，完成后展示官方 `usage`。 |

## 4. 实现范围

### 4.1 必须实现

- Seedance 2.0 文生视频。
- Seedance 2.0 的 1–9 张参考图片生视频。
- 本地 PNG/JPEG/WebP 上传。
- 公网 HTTPS 图片 URL 登记。
- Tiptap `@图片N` 原子引用和稳定序列化。
- Dry-run、一次性确认和 1–4 条顺序创建。
- 单任务查询、列表查询、轮询、历史恢复、取消和删除。
- 成功视频、尾帧、用量、错误和时效信息展示。
- 完整无成本测试与一次最低成本真实任务验证。
- 开源仓库文档、CI 和安全材料。

### 4.2 明确不实现

- 参考视频和参考音频输入。
- 真人素材授权、虚拟人像库和资产接收流程。
- callback webhook。
- Seedance 1.5 Draft 工作流。
- 联网搜索工具。
- 数据库、认证、账号、计费和多人协作。
- 自动 TOS 转存或长期保存生成结果。
- 生产级远程媒体探测器。

未实现的字段不会用猜测值发送给 Ark。API 合规表示“所有实际发送字段和生命周期调用均符合官方规范”，不表示覆盖 Seedance 的全部产品能力。

## 5. 架构与数据流

项目保持单仓库：

```text
Vue 3 Composer
  ├─ Reference media（upload / remote URL）
  ├─ Tiptap document + mediaMention
  ├─ Generation config
  ├─ Dry-run / confirmation drawer
  └─ Task history and result panel
            │
            ▼
Express reference adapter
  ├─ Authoritative media registry
  ├─ DTO validation and request builder
  ├─ One-time confirmation store
  └─ Ark API client
            │
            ▼
Volcengine Ark video generation API
```

完整数据流：

1. 用户上传图片或登记公网 HTTPS 图片 URL。
2. 服务端生成不可伪造的 `mediaId` 并保存权威媒体记录。
3. 用户在 Tiptap 中通过 `@图片N` 引用媒体。
4. 前端只提交 `mediaId`、`realIndex`、Tiptap 文档和生成参数。
5. 服务端重新读取权威媒体记录，构造模型文本与 `content` 数组。
6. Dry-run 返回最终 Ark JSON、阻断项和一次性确认 token。
7. 用户显式确认后创建一个或多个独立任务。
8. 前端立即轮询任务，也可通过列表 API 恢复最近任务。
9. 终态停止轮询；成功时展示视频、用量和下载提示。
10. queued 任务可取消；succeeded、failed、expired 记录可删除。

## 6. 媒体模型与公网 URL

统一媒体模型：

```js
{
  id,
  source: 'upload' | 'remote_url',
  kind: 'image',
  name,
  realIndex,
  previewUrl,
  remoteUrl,
  width,
  height,
  mimeType,
  size,
  status: 'ready' | 'error'
}
```

### 6.1 本地上传

本地上传在服务端完成强校验：

- 类型只开放 PNG、JPEG、WebP，属于官方支持格式的安全子集。
- 单张文件严格小于 30 MB。
- 宽高分别在 300–6000 px。
- 宽高比在 0.4–2.5。
- 文件签名、完整结构、真实解码格式、单帧和像素数量均有效。
- 单个草稿最多 9 张参考图片。

### 6.2 公网 URL

新增 `POST /api/videoGeneration/registerRemoteReference`。服务端验证并持久化 URL 记录，但不主动下载 URL：

- 只允许 `https:`。
- 禁止用户名和密码。
- 禁止 localhost、`.localhost`、`.local`、字面 IPv4/IPv6。
- 拒绝空主机、控制字符、异常端口和超长输入。
- 规范化后保存，Dry-run 从服务端记录重新读取。
- 浏览器预览使用 `referrerpolicy="no-referrer"`。

远程 URL 的可达性、媒体 MIME、实际大小和像素约束由 Ark 创建接口最终校验。Dry-run 必须显示“仅完成 URL 结构校验，未预取远程内容”，避免把语法校验误称为媒体校验。

## 7. Prompt 与请求构造

Tiptap 文档仍是 Prompt 的唯一真相来源。媒体按文档首次引用顺序分配 `canonicalIndex`，未引用但已加入的媒体追加到末尾。同一媒体重复引用只发送一次。

输出保留三层文本：

- `readablePrompt`：面向用户，例如 `让 @图片1 挥手`。
- `templatePrompt`：用于本地迁移和调试，例如 `<<<image_1_1>>>`。
- `modelPrompt`：面向模型的自然语言序号，例如 `让【图片 1】挥手`。

正式协议绑定依赖 `content` 数组顺序和每张图片的 `role: reference_image`，而不是依赖控制台私有模板标记。

所选 Seedance 2.0 场景支持以下请求参数：

| 参数 | 前端能力 | 约束 |
| --- | --- | --- |
| `model` | 服务端配置 | 默认 `doubao-seedance-2-0-260128`。 |
| `content` | Prompt + 图片 | 文本可选；参考图 1–9 张时每张使用 `reference_image`。 |
| `ratio` | 普通选项 | adaptive、16:9、4:3、1:1、3:4、9:16、21:9。 |
| `resolution` | 普通选项 | 480p、720p、1080p、4k。 |
| `duration` | 普通选项 | 4–15 的任意整数或 `-1`。 |
| `generate_audio` | 普通选项 | boolean。 |
| `return_last_frame` | 高级选项 | 默认 false。 |
| `watermark` | 高级选项 | 默认 false。 |
| `execution_expires_after` | 高级选项 | 3600–259200，默认 172800。 |
| `priority` | 高级选项 | 0–9，默认 0。 |

`count` 是本地适配层参数，不发送给 Ark。`count > 1` 时按顺序创建多个单结果任务，中途失败立即停止，并返回已创建的任务 ID。

以下字段不发送：`service_tier`、`frames`、`seed`、`camera_fixed`、`draft`、`tools`、`callback_url`。`safety_identifier` 只提供生产集成钩子；本地演示没有终端用户身份，不能伪造固定值，也不能直接发送邮箱等隐私数据。

## 8. 本地 API 与 Ark 映射

本地接口保持 `{ code, data, msg }` 包络：

```text
POST /api/videoGeneration/uploadReference
POST /api/videoGeneration/registerRemoteReference
POST /api/videoGeneration/deleteReference
POST /api/videoGeneration/dryRun
POST /api/videoGeneration/createTask
GET  /api/videoGeneration/getTask
GET  /api/videoGeneration/listTasks
POST /api/videoGeneration/deleteTask
```

Ark client 增加 `listTasks(filters)`。列表参数使用 `URLSearchParams` 构造：

- `page_num`：1–500，默认 1。
- `page_size`：1–500，前端默认 20。
- `filter.status`：只接受官方列表筛选支持的 queued、running、cancelled、succeeded、failed；`expired` 可出现在响应中，但不作为列表筛选值发送。
- `filter.task_ids`：通过重复参数名传递多个任务 ID。
- `filter.model`：Endpoint ID 精确筛选。
- `filter.service_tier`：只作为列表筛选，不进入 Seedance 2.0 创建请求。

所有 Ark client 调用继续使用固定 HTTPS Base URL、Bearer API Key、禁止重定向、有界超时、有界 JSON 响应和敏感字段脱敏。

## 9. 前端组件

### 9.1 `ReferenceMediaPanel`

- 提供“上传文件”和“公网 URL”两个入口。
- URL 表单包含地址和可选显示名称。
- URL 登记成功后与本地图片共享缩略图、`图片N`、删除和 mention 流程。
- 远程图片加载失败只影响预览，不允许前端自行删除服务端权威记录。

### 9.2 `GenerationOptionsBar`

- 普通区域显示比例、分辨率、时长、条数和音频。
- 高级区域显示尾帧、水印、任务超时和优先级。
- 约束来自共享常量，不在组件、store 和路由中维护多份枚举。

### 9.3 `RequestPreviewDrawer`

- 显示三层 Prompt、媒体映射、最终 Ark JSON 和字段来源。
- 显示创建任务数量和“实际费用以方舟控制台为准”。
- 明确区分本地强校验媒体与仅 URL 结构校验媒体。
- 只有当前 Dry-run 的 `realReady` 为 true 时显示付费确认。

### 9.4 `GenerationTaskPanel`

- 提供按需加载的历史任务、分页和筛选。
- 显示 id 的脱敏摘要、模型、状态、创建/更新时间、分辨率、比例、时长和音频。
- succeeded 显示视频、尾帧、usage 和 24 小时有效期提醒。
- failed 显示 `error.code` 和 `error.message`。
- expired 显示任务超时并停止轮询。
- queued 显示“取消任务”；succeeded、failed、expired 显示“删除记录”；running、cancelled 不显示可执行 DELETE。
- DELETE 成功后 queued 本地更新为 cancelled；已完成记录从列表移除。若状态竞态导致 Ark 拒绝，刷新真实状态并展示错误。

## 10. 状态机与轮询

官方任务状态：

```text
queued ───────► running ───────► succeeded
   │               │            failed
   │               └──────────► expired
   └── DELETE ────────────────► cancelled
```

运行态：`queued`、`running`。终态：`succeeded`、`failed`、`cancelled`、`expired`。

- 创建成功后立即启动轮询。
- 页面可见时每 3 秒查询；隐藏时每 10 秒查询。
- 终态立即停止。
- 过期响应必须通过 epoch/revision guard 丢弃。
- 查询网络错误可继续有界轮询；明确的 400、401、403、404 不无限重试。
- 超过 7 天、已删除或不可查询的任务显示为本地 `unavailable` 展示状态；`unavailable` 不作为 Ark 协议状态发送或持久化。
- 列表 API 只在用户点击“加载历史”或刷新筛选时调用，不在 Dry-run 页面自动访问 Ark。

## 11. 错误处理

服务端代理保留安全的上游语义：

- 400：参数或内容安全错误。
- 401/403：鉴权或权限错误。
- 404：任务不存在、已删除或超出查询范围。
- 429：配额或排队限制。
- 5xx：Ark 服务异常。
- 504：本地适配层检测到超时。

错误响应继续使用本地包络，但在 `data.error` 中保留脱敏后的 `status`、`code`、`message`、`requestId`。HTTP status 使用合法上游状态，不统一改写为 502。

创建请求不自动重试。确认 token 在第一次创建尝试前消费，即使网络状态不明也必须重新 Dry-run 和人工确认，避免重复计费。

## 12. 安全边界

- `ARK_API_KEY` 只由 Node 服务端读取，禁止任何 `VITE_ARK_API_KEY`。
- `.env.local`、上传内容、媒体索引、真实生成结果和本地验证产物均被 Git 忽略。
- Dry-run 永不调用 Ark。
- 列表和查询是只读上游调用，不创建计费任务。
- 真实创建必须满足服务端开关、API Key、有效媒体、当前 Dry-run 和一次性确认 token。
- 远程 URL 登记不触发服务端网络访问，避免 SSRF。
- Authorization、API Key、完整任务 ID、临时结果 URL 不写入公开日志、快照、文档或 CI artifact。
- 任务创建不自动重试；多任务部分成功不自动补偿。
- 开源前扫描 Git 跟踪文件和提交差异中的密钥模式。

## 13. 测试策略

官方 API 审查是代码修改后测试的前置门禁，已经于 2026-07-17 完成。原有 227 项测试只作为修改前基线，不计入最终验收。

### 13.1 单元测试

- Prompt 三层序列化和媒体规范顺序。
- 1、9、10 张媒体边界。
- 全部合法与非法比例、分辨率、时长和高级参数。
- Seedance 2.0 不支持字段永不进入请求。
- 本地图片尺寸、比例、格式、像素和大小边界。
- 远程 URL 的协议、凭据、主机、IP、控制字符和长度攻击。
- 远程登记过程没有任何网络请求。
- `expired` 状态和终态集合。
- DELETE 状态操作矩阵。

### 13.2 Ark client 与服务端契约测试

- 四个官方接口的方法、固定路径、Header 和 Body。
- 列表分页、筛选和重复 `filter.task_ids`。
- 204 与 `{}` DELETE 响应。
- 400、401、403、404、429、5xx、超时、重定向、非 JSON 和超大响应。
- Request ID 与敏感值脱敏。
- Dry-run 零 Ark 调用。
- 一次性确认、草稿变更、并发确认和部分创建成功。
- 所有 DTO 都从媒体注册表读取权威 URL。

### 13.3 Store 与组件测试

- 公网 URL 登记、预览、删除和 mention。
- 普通与高级参数更新。
- Dry-run 预览和付费按钮门禁。
- 创建后立即轮询。
- queued、running、succeeded、failed、cancelled、expired 展示。
- 错误信息、视频、尾帧、usage 和时效提醒。
- 历史分页和筛选。
- 取消/删除按钮、禁用状态和竞态错误。
- 页面隐藏轮询和过期响应保护。

### 13.4 开源质量门禁

```bash
npm run test
npm run lint
npm run build
npm audit --omit=dev
```

同时运行 tracked-files secret scan，并在 GitHub Actions 的干净 Ubuntu 环境重复依赖安装、运行时依赖审计、secret scan、test、lint 和 build。

## 14. 真实任务验收

真实调用只在全部无成本门禁通过后执行，并在最终付费动作前再次获得即时确认。

固定验收参数：

```text
model: doubao-seedance-2-0-260128
input: 一张符合约束的公开非真人风景图
prompt: 镜头沿木栈道缓慢向前移动，树叶随微风轻轻摇曳
ratio: adaptive
resolution: 720p
duration: 5
count: 1
generate_audio: false
```

验收步骤：

1. 用临时进程环境开启真实生成，不改写 `.env.local`。
2. 从实际前端登记公网 URL 并插入 `@图片1`。
3. 通过实际前端执行 Dry-run 并核对最终请求。
4. 再次确认后只创建一次任务。
5. 轮询到官方终态，不自动重试创建。
6. succeeded 时验证 HTTPS `video_url`、MP4 文件、usage 和列表可恢复性。
7. 将视频下载到 Git 忽略的本地验证目录，计算文件大小和 SHA-256。
8. 写入可公开的脱敏验证报告，只记录模型、参数、状态迁移、用量、大小和哈希。

真实任务不调用 DELETE，以保留验收证据。DELETE 通过完整模拟契约测试验证。若真实创建返回参数、权限、余额、配额或内容安全错误，立即停止，不发起第二次付费调用。

## 15. 开源交付

新增或更新：

- `LICENSE`
- `README.md`（英文）
- `README.zh-CN.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/workflows/ci.yml`
- `.github/ISSUE_TEMPLATE/`
- `.github/pull_request_template.md`
- API 合规矩阵和脱敏验证报告

`package.json` 去除 `private: true`，补齐 description、license、repository、keywords、engines 和 files 元数据。项目作为 GitHub 源码参考仓库发布，不承诺发布 npm 包。

最终创建公开仓库并推送 `main`，再确认 GitHub Actions 成功。仓库描述必须明确：这是用于学习和迁移的参考实现，真实使用会产生 Ark 费用，生产环境需要自行补充认证、持久化、对象存储和业务级安全控制。

## 16. 验收标准

- 四个官方 API 均有实现映射和精确契约测试。
- 所有实际发送字段符合当前 Seedance 2.0 场景约束。
- 公网 URL 可完成参考图片生成，不依赖 `PUBLIC_MEDIA_BASE_URL`。
- `expired`、任务列表和 DELETE 状态语义完整。
- 前端可完成创建、轮询、展示、历史恢复和状态相关操作。
- 无成本测试、lint、build、依赖审计、secret scan 和 CI 全部通过。
- 一次最低成本真实任务到达终态，并产生脱敏证据。
- 公开 GitHub 仓库使用 MIT、双语 README，且不含秘密或临时结果 URL。
