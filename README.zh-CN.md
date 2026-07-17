# Ark 参考视频 Composer

[English](README.md)

这是一个基于 Vue 3 的 Seedance 2.0 视频生成参考实现，包含 Tiptap 原子素材引用、最小 Express 适配层和完整 Ark 任务生命周期。本项目以源码形式公开，用于学习和迁移；没有发布 npm 包。

## 项目演示内容

- 所选 Seedance 2.0 模型的文生视频和参考图片生视频。
- 一至九张本地 PNG/JPEG/WebP 图片，或登记的公网 HTTPS 图片 URL。
- Tiptap 文档中的原子 `@图片N` 引用，以及确定性的可读、模板和模型提示词。
- 服务端权威素材登记、严格请求构造、Dry-run 预览、一次性确认，以及一至四个任务的顺序创建。
- 创建后立即展示临时任务、按有界计划轮询、恢复任务历史、按状态取消/删除、展示用量，以及识别 `succeeded`、`failed`、`cancelled`、`expired` 终态。

[API 合规矩阵](docs/api-conformance.md)把每个已实现的 Ark 生命周期接口映射到 client、适配层、store 和契约测试。

## 安全与费用边界

`APP_REAL_GENERATION_ENABLED=false` 是默认值。Dry-run 从不调用 Ark，也不会创建付费任务。真实生成会产生费用；实际费用和额度以火山方舟控制台为准。

`ARK_API_KEY` 只能存在于服务端，禁止使用 `VITE_` 前缀。真实创建还要求当前有效的 Dry-run、公开素材和用户显式使用一次性确认。创建请求不会自动重试。成功视频和尾帧 URL 会在 24 小时后失效，请及时下载或转存。任务查询只覆盖最近七天。

## 架构

```text
Vue 3 Composer
  ├─ 上传 / 公网 HTTPS 参考图登记
  ├─ Tiptap 文档 + 原子 mediaMention 节点
  ├─ 生成参数 + Dry-run 确认
  └─ 任务历史、轮询、结果、取消/删除
                 │ { code, data, msg }
                 ▼
Express 参考适配层
  ├─ 权威内存素材登记
  ├─ 校验 + Ark 请求构造
  ├─ 一次性确认存储
  └─ 固定源站 Ark API client
                 │
                 ▼
火山方舟视频生成 API
```

浏览器只提交素材 ID 和编辑器 JSON。适配层重新读取权威素材记录，构造有序 Ark `content` 数组，并确保凭据不会进入浏览器包。

## 快速启动

需要 Node.js 22 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run serve
```

打开 `http://127.0.0.1:8080/#/video-generation`。健康检查地址是 `http://127.0.0.1:8888/api/health`。如有端口冲突，可用 `VITE_CLI_PORT` 和 `VITE_SERVER_PORT` 调整。

## 公网 URL 工作流

选择公网 URL 入口，输入 HTTPS 图片地址和可选显示名称，然后登记。服务端只接受结构安全的公网主机名：禁止凭据、localhost/本地域名、字面 IP、控制字符和异常端口。

URL 素材不会被预取。因此登记只验证 URL 结构，不验证可达性、MIME、字节大小或像素；Ark 会在真实创建时执行媒体校验。浏览器预览使用 no-referrer 策略。该工作流不需要 `PUBLIC_MEDIA_BASE_URL`。

## 本地上传工作流

选择一至九张 PNG、JPEG 或 WebP 图片，并从编辑器菜单插入原子 `@图片N` 引用。服务端校验文件签名、可解码性、单帧结构、300–6000 px 尺寸、0.4–2.5 宽高比，以及严格小于 30 MB 的大小。

本地 `/uploads` 路径可用于预览和 Dry-run，但 Ark 无法访问。真实生成时应配置由合适存储支持的公网 HTTPS `PUBLIC_MEDIA_BASE_URL`，或使用公网 URL 工作流。

## Dry-run 与真实生成

Dry-run 校验规范化编辑器文档、素材登记和配置，随后返回三层提示词、规范素材顺序、准确 Ark 请求体、阻断项，以及仅在所有门禁通过时签发的一次性确认 token。它不会调用 Ark。

真实创建要求 `APP_REAL_GENERATION_ENABLED=true`、服务端密钥、可访问的公开素材、未改变的 Dry-run 和显式确认。`count` 是本地参数：适配层顺序创建一至四个单结果任务，首次错误后停止，并保留已经创建的任务 ID。对结果不确定或部分成功的付费请求既不重试，也不补偿创建。

## 环境变量

| 变量 | 作用域 | 用途 |
| --- | --- | --- |
| `VITE_CLI_PORT` | 浏览器工具 | Vite 端口，默认 `8080`。 |
| `VITE_SERVER_PORT` | 服务端/启动器 | Express 端口，默认 `8888`。 |
| `VITE_BASE_API` | 浏览器 | Axios API 前缀，默认 `/api`。 |
| `VITE_BASE_PATH` | 浏览器 | 本地开发基地址，默认 `http://127.0.0.1`。 |
| `SERVE_SERVER_ENTRYPOINT` | 启动器 | 服务端入口，默认 `server/index.js`。 |
| `SERVER_HOST` | 服务端 | 监听地址，默认 `127.0.0.1`。 |
| `ARK_BASE_URL` | 服务端 | 固定、受批准的 Ark OpenAPI 源站。 |
| `ARK_MODEL` | 服务端 | 所选 Seedance 2.0 Endpoint/模型标识。 |
| `ARK_API_KEY` | 服务端密钥 | Ark 凭据，禁止通过 `VITE_*` 暴露。 |
| `PUBLIC_MEDIA_BASE_URL` | 服务端 | 本地上传可选的公网 HTTPS 基地址。 |
| `APP_REAL_GENERATION_ENABLED` | 服务端 | 付费生成门禁，默认 `false`。 |

本地密钥只能存放在已忽略的 `.env.local`。被跟踪的 `.env.example` 故意不为密钥填写值。

## API 生命周期

本地适配层在 `/api/videoGeneration` 下提供上传、公网登记、素材删除、Dry-run、任务创建、单任务查询、列表查询和任务取消/删除。付费生命周期映射如下：

1. `POST /api/v3/contents/generations/tasks` 创建单个任务。
2. `GET /api/v3/contents/generations/tasks/{id}` 驱动按页面可见性调整的有界轮询。创建后会立即展示临时 `queued` 任务；首次有界 GET 在页面可见时等待 3 秒、隐藏时等待 10 秒。
3. `GET /api/v3/contents/generations/tasks` 通过分页和受支持筛选，在用户显式请求时恢复最近历史。
4. `DELETE /api/v3/contents/generations/tasks/{id}` 取消 queued 任务或删除符合条件的终态记录。

`queued` 和 `running` 是运行态；`succeeded`、`failed`、`cancelled`、`expired` 是终态。UI 不会把 `expired` 作为列表筛选发送；当旧任务或已删除任务无法查询时，只使用本地展示状态 `unavailable`。

## 测试

```bash
npm audit --omit=dev
npm run check:secrets
npm run test
npm run lint
npm run build
```

密钥扫描器只读取 `git ls-files` 返回的路径，跳过二进制文件和 `.env.example`，绝不会打开已忽略的 `.env.local`。CI 在推送或提交到 `main` 的 pull request 上使用 Node.js 22 和 `npm ci` 重复上述检查。

## 已知限制

所选实现支持 Seedance 2.0 文本加 1–9 张参考图、选定视频参数和全部四个任务接口。callback、tools、draft 工作流、frames、seed、相机控制和创建时 service tier 等 Ark 可选字段被有意省略。参考视频/音频、真人素材授权、联网搜索、生产级远程媒体探测、自动长期保存、数据库持久化、认证、计费和多人协作属于不支持的产品能力，并非被静默模拟的字段。

内存登记和本地上传目录仅供开发参考。适配层重启后会丢失素材登记和确认，结果 URL 仍是临时的。

## 迁移

保留 `src/view/videoGeneration/`、`src/api/videoGeneration.js`、`{ code, data, msg }` 包络、Tiptap 原子节点、服务端权威素材解析和一次性确认语义。用业务的认证服务、对象存储/CDN 和持久缓存替换本地素材及确认状态。密钥必须留在服务端，并保留任务创建不重试规则。详见[迁移指南](docs/migration/hc-gpt-web.md)。

## 安全

部署或报告漏洞前请阅读 [SECURITY.md](SECURITY.md)。不要在 issue 或日志中发布凭据、私有素材、完整真实任务 ID 或临时结果 URL。生产部署需要认证、授权、持久化、限流、滥用防护、审计和适当的合规工作。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 并遵守[行为准则](CODE_OF_CONDUCT.md)。完成全部本地检查后，欢迎提交聚焦的 issue 和 pull request。

## 许可证

MIT © 2026 XucroYuri。详见 [LICENSE](LICENSE)。本仓库只发布源码，没有发布 npm 包。
