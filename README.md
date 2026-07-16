# 方舟参考素材视频生成 Composer MVP

这是一个面向迁移的 Vue 3 原型，用来复刻火山方舟「体验视频生成」页面中被标注的视频生成输入组件。重点不是复刻方舟控制台整站，而是把组件内部的核心能力做成可运行、可验证、低迁移成本的 MVP：

- 本地上传参考图，显示为稳定的 `图片1`、`图片2`。
- 在提示词中通过 `@` 菜单插入原子化素材引用，例如 `@图片1`。
- 将编辑器内容序列化成三层提示词：用户可读文本、控制台兼容模板、模型规范文本。
- 生成 Ark 风格的最终 API 请求结构，但默认只走 Dry-run，不创建真实付费任务。
- 在满足显式条件时才允许真实生成：服务端开关、服务端密钥、公开素材 URL、当前草稿 Dry-run、一次性确认 token。

项目结构刻意对齐 `/Users/huachi/Code/huachi.online/hc-gpt-web`：Vue 3 JavaScript SFC、Element Plus、Pinia、Axios API 模块、Hash Router、Tiptap JSON、SCSS，以及 `{ code, data, msg }` 响应包裹格式。

## 快速启动

```bash
npm install
npm run serve
```

启动后：

- 前端地址：`http://127.0.0.1:8080/#/video-generation`
- 健康检查：`http://127.0.0.1:8888/api/health`

如果 `8080` 或 `8888` 被占用，可以临时指定端口：

```bash
VITE_CLI_PORT=43127 VITE_SERVER_PORT=43128 npm run serve
```

## 常用命令

```bash
npm run serve   # 同时启动 Express 本地适配层和 Vite 前端
npm run test    # 运行前端、服务端、序列化、运行时保护测试
npm run lint    # ESLint 零 warning 检查
npm run build   # 生产构建；qaMedia 调试入口不会进入生产分支
```

## 成本边界：默认只做 Dry-run

默认提交按钮调用：

```text
POST /api/videoGeneration/dryRun
```

Dry-run 会做这些事：

1. 校验 Tiptap 文档、素材列表和生成参数。
2. 从服务端素材索引重新读取权威素材元数据，避免前端伪造 URL 或状态。
3. 生成可读提示词、模板提示词、模型提示词和 Ark 请求体。
4. 返回真实生成阻塞项，例如未启用真实生成、缺少 `ARK_API_KEY`、素材不是公开 HTTPS URL。

Dry-run 不会调用 Ark，也不会创建付费任务。测试、浏览器 QA、视觉 QA 全部停在 Dry-run。

## 真实生成必须满足的条件

真实任务创建接口是：

```text
POST /api/videoGeneration/createTask
```

它只在以下条件全部满足时工作：

- `APP_REAL_GENERATION_ENABLED=true`
- 服务端进程存在 `ARK_API_KEY`
- 当前草稿已经成功 Dry-run
- 参考素材是 Ark 可访问的公开 HTTPS URL，或是 Ark 资产 URL
- 请求携带当前草稿对应的一次性 `confirmationToken`
- 用户在预览抽屉中显式确认真实生成

实现上不会自动重试任务创建。这样可以避免网络状态不明确或 Ark 返回部分失败时重复创建付费任务。若 `count > 1`，服务端按顺序创建任务；如果中途失败，会返回已经创建成功的 `taskIds`，方便后续查询和追踪。

## 环境变量

| 变量 | 作用域 | 说明 |
| --- | --- | --- |
| `VITE_CLI_PORT` | 前端 | Vite 端口，默认 `8080`。 |
| `VITE_SERVER_PORT` | 服务端 | Express 适配层端口，默认 `8888`。 |
| `VITE_BASE_API` | 前端 | Axios API 前缀，默认 `/api`。 |
| `VITE_BASE_PATH` | 前端 | 本地联调基地址，默认 `http://127.0.0.1`。 |
| `SERVE_SERVER_ENTRYPOINT` | 启动器 | `npm run serve` 使用的服务端入口，默认 `server/index.js`。 |
| `SERVER_HOST` | 服务端 | Express 监听地址，默认 `127.0.0.1`。 |
| `ARK_BASE_URL` | 服务端 | Ark OpenAPI 地址，默认 `https://ark.cn-beijing.volces.com/api/v3`。当前实现会校验该地址，避免误连非预期域名。 |
| `ARK_MODEL` | 服务端 | 默认模型 ID，当前为 `doubao-seedance-2-0-260128`。 |
| `ARK_API_KEY` | 服务端密钥 | 只能放在服务端环境中，禁止创建 `VITE_ARK_API_KEY` 或任何前端可见密钥。 |
| `PUBLIC_MEDIA_BASE_URL` | 服务端 | 将本地上传文件转换成 Ark 可访问公开 URL 的 HTTPS 基地址。 |
| `APP_REAL_GENERATION_ENABLED` | 服务端 | 真实付费任务开关，默认关闭。 |

本地密钥请复制 `.env.example` 到被 Git 忽略的 `.env.local`。加载顺序是 `.env.development` → `.env.local` → 当前进程环境变量，后者覆盖前者。

## 素材 URL 边界

本地上传预览使用：

```text
/uploads/<uuid>.<ext>
```

浏览器预览和 Dry-run 可以使用这个地址，但 Ark 不能访问 `127.0.0.1`、内网地址或本机文件路径。真实生成前必须满足其中一种条件：

- `PUBLIC_MEDIA_BASE_URL` 指向 Ark 可访问的公开 HTTPS 域名；
- 素材本身已经是 Ark 资产 URL。

不满足时 Dry-run 会返回 `MEDIA_NOT_PUBLIC` 阻塞项，并且真实生成按钮保持不可用。

## `@图片N` 的实现方式

编辑器不是普通 textarea，也不是简单字符串替换。实现方式是：

1. Tiptap 文档中插入 `mediaMention` 原子节点。
2. 节点属性保存 `mediaId`、`kind`、`sourceLabel`、`realIndex`。
3. 页面显示为 `@图片1` 这样的可视 pill。
4. 序列化时按文档中第一次出现的顺序重新计算 `canonicalIndex`。
5. 输出三类提示词：
   - 可读提示词：`让 @图片1 挥手`
   - 控制台兼容模板：`让 <<<image_1_1>>> 挥手`
   - 模型规范文本：`让 【图片 1】 挥手`
6. 最终 Ark 请求体中，`content` 第一项是文本，后续是 `image_url` 参考图。

典型 Dry-run 请求预览：

```json
{
  "model": "doubao-seedance-2-0-260128",
  "content": [
    { "type": "text", "text": "让 【图片 1】 挥手" },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": { "url": "local://<mediaId>" }
    }
  ],
  "ratio": "adaptive",
  "resolution": "720p",
  "duration": 5,
  "generate_audio": false
}
```

## 关键目录

| 路径 | 说明 |
| --- | --- |
| `src/view/videoGeneration/index.vue` | Composer 页面入口。 |
| `src/view/videoGeneration/components/` | 上传区、编辑器、参数栏、预览抽屉、任务状态组件。 |
| `src/view/videoGeneration/editor/` | Tiptap 原子节点和 `@` suggestion 逻辑。 |
| `src/view/videoGeneration/store/index.js` | Pinia 状态、上传、Dry-run、真实确认、轮询。 |
| `src/view/videoGeneration/utils/requestBuilder.js` | 纯函数序列化层，前后端共用语义。 |
| `src/api/videoGeneration.js` | 迁移到 `hc-gpt-web` 时可保留的 API 模块。 |
| `server/routes/videoGeneration.js` | Express 原型路由；迁移时对应 Gin router/api/service。 |
| `server/media/store.js` | 本地素材存储、安全校验、公开 URL 生成。 |
| `server/ark/client.js` | Ark OpenAPI 客户端，包含响应大小限制和敏感信息脱敏。 |
| `docs/research/` | 源站取证、设计 token、组件规格。 |
| `docs/design-references/` | 源站截图、实现截图、并排对比图。 |
| `design-qa.md` | 最终浏览器与视觉 QA 记录。 |

## 迁移到 hc-gpt-web 的最短路径

1. 复制 `src/view/videoGeneration/` 和 `src/api/videoGeneration.js`。
2. 在 Hash Router 或动态菜单中注册 `/video-generation`。
3. 删除原型里的 `src/utils/request.js`，让 `@/utils/request` 指向 `hc-gpt-web` 现有封装。
4. 将 Express 的 `/videoGeneration/*` DTO 迁移到 `hc-gpt-server` Gin 层，保持前端 payload 不变。
5. 用现有上传/CDN 能力替换 `server/media/store.js` 的本地磁盘实现。
6. 将 `ARK_MODEL` 接入现有模型/供应商配置。
7. 跑测试和 Dry-run 后，再决定是否打开真实生成。

更细的迁移清单见 `docs/migration/hc-gpt-web.md`。

## 验证门禁

交付前已执行：

```bash
npm run test
npm run lint
npm run build
```

浏览器和视觉证据见：

- `design-qa.md`
- `docs/design-references/ark-composer-comparison-desktop.png`
- `docs/design-references/ark-composer-comparison-mobile.png`

## 已知限制

- 原型只复刻被标注的 Composer，不复刻方舟侧边栏、顶部导航、图库、历史记录或认证体系。
- 自动化浏览器上传本地文件时，Chrome 扩展需要开启 “Allow access to file URLs”；否则 QA 使用本地 API 上传后，通过 development-only `qaMedia` seed 复现编辑链路。
- `qaMedia` 只在 `import.meta.env.MODE === 'development'` 时读取，生产构建不会开放这个调试入口。
