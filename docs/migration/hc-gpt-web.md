# 迁移到 hc-gpt-web / hc-gpt-server 指南

本文面向中文母语开发者，目标是把当前 MVP 以最低成本迁移到 `/Users/huachi/Code/huachi.online/hc-gpt-web`，并把本地 Express 适配层迁移到 `hc-gpt-server`。迁移时优先保持前端 payload 和响应包裹格式不变。

## 迁移原则

1. **前端尽量原样搬迁。** 组件、store、editor、serializer 都按 `hc-gpt-web` 的 Vue 3 + JS SFC 风格写成。
2. **后端只迁移边界，不迁移本地存储实现。** Express 是原型适配层；真正接入时应复用 `hc-gpt-server` 已有上传、鉴权、日志、配置、缓存能力。
3. **Dry-run 是默认入口。** 迁移完成前不要打开真实生成。
4. **真实生成必须服务端兜底。** 前端按钮禁用只是体验层；服务端仍要校验开关、密钥、公开素材 URL、确认 token 和参数合法性。
5. **不引入方舟控制台壳层。** 本原型只复刻被标注的视频生成 Composer，不复制方舟导航、图库、历史记录或登录态逻辑。

## 推荐迁移顺序

1. 复制前端目录：

   ```text
   src/view/videoGeneration/
   src/api/videoGeneration.js
   ```

2. 在 `hc-gpt-web` 的 Hash Router 或动态菜单表里注册页面：

   ```js
   {
     path: '/video-generation',
     name: 'VideoGeneration',
     component: () => import('@/view/videoGeneration/index.vue'),
   }
   ```

3. 删除原型里的请求封装依赖：

   - 不迁移 `src/utils/request.js`。
   - 让 `src/api/videoGeneration.js` 继续使用 `hc-gpt-web` 现有 `@/utils/request`。

4. 保留前端 DTO，不重命名字段。

5. 在 `hc-gpt-server` 中新增 `/videoGeneration/*` 路由，把 Express 中的校验逻辑迁移到 Gin router/api/service。

6. 用正式上传/CDN/对象存储能力替换 `server/media/store.js`。

7. 用正式缓存或数据库替换 `server/security/confirmationStore.js`，但保留“五分钟、一次性、绑定当前请求 hash”的语义。

8. 接入现有模型配置，避免在 UI 中写死未来模型：

   - 原型默认：`doubao-seedance-2-0-260128`
   - 正式环境：建议从 `aiModels` / `modelProvider` 等现有配置读取。

9. 跑完整测试和一次 Dry-run，再评估真实生成开关。

## 文件迁移对照表

| 原型文件 | 迁移目标 | 处理建议 |
| --- | --- | --- |
| `src/view/videoGeneration/index.vue` | `hc-gpt-web` 页面目录 | 可直接复制。development-only `qaMedia` seed 在生产构建不启用，可保留；若团队不需要浏览器 QA 复现，也可以删除该函数和对应测试说明。 |
| `src/view/videoGeneration/components/*.vue` | 同功能组件目录 | 依赖 Element Plus 和 `@element-plus/icons-vue`，不依赖原型私有 UI 库。 |
| `src/view/videoGeneration/editor/*.js` | 同 editor 目录 | Tiptap 扩展是纯前端模块，建议连同测试一起迁移。 |
| `src/view/videoGeneration/utils/requestBuilder.js` | 前端 utils 或前后端共享包 | 建议保持纯函数形态，便于服务端复用相同序列化语义。 |
| `src/view/videoGeneration/store/index.js` | 同 Pinia store 目录 | 使用 setup store，API 响应按 `{ code, data, msg }` 解包。 |
| `src/api/videoGeneration.js` | `hc-gpt-web/src/api/videoGeneration.js` | 只保留 API 函数，复用现有 request 封装。 |
| `server/routes/videoGeneration.js` | `hc-gpt-server` Gin router/api/service | 保持路由名和 payload，不要让前端迁移时二次适配。 |
| `server/media/store.js` | 正式上传/素材服务 | 迁移安全校验策略，不建议照搬本地磁盘存储。 |
| `server/security/confirmationStore.js` | Redis、内存缓存或数据库 | 保留一次性确认 token 语义。 |
| `server/ark/client.js` | Ark service/client | 保留 base URL 白名单、响应大小限制、超时和敏感信息脱敏。 |
| `.env.example` | 部署文档 | 保留服务端密钥约束，禁止任何 `VITE_ARK_API_KEY`。 |

## 前端 API 边界

迁移时保持这些函数签名：

```js
uploadReference(formData)
deleteReference({ mediaId })
dryRunVideoGeneration({ doc, mediaList, config })
createVideoGenerationTask({ doc, mediaList, config, confirmationToken })
getVideoGenerationTask({ taskId })
deleteVideoGenerationTask({ taskId })
```

所有接口继续返回：

```js
{ code: 0, data: {}, msg: '操作成功' }
```

前端 store 只相信服务端响应，不信任本地素材 URL、`realReady` 或用户传入的 `remoteUrl`。正式环境也应保持这个方向：服务端重新解析素材 ID，返回权威素材信息。

## 后端路由建议

建议在 `hc-gpt-server` 中保留以下路由名，降低前端迁移成本：

| 路由 | 作用 | 关键约束 |
| --- | --- | --- |
| `POST /videoGeneration/uploadReference` | 上传参考素材 | 校验 MIME、签名、大小、尺寸、可解码性；返回素材 ID 和预览 URL。 |
| `POST /videoGeneration/deleteReference` | 删除参考素材 | 按素材 ID 删除；删除不存在素材应幂等。 |
| `POST /videoGeneration/dryRun` | 生成预览请求 | 不调用 Ark；返回 serialization、request、blockers、realReady、confirmationToken。 |
| `POST /videoGeneration/createTask` | 创建真实生成任务 | 必须校验开关、密钥、公开素材 URL、确认 token；不自动重试。 |
| `GET /videoGeneration/getTask` | 查询任务状态 | 未启用真实生成时直接返回 runtime blocker。 |
| `POST /videoGeneration/deleteTask` | 删除/取消任务 | 同样受真实生成 runtime gate 保护。 |

## Dry-run 返回结构

Dry-run 是正式接入前最重要的调试入口，建议保留当前结构：

```js
{
  serialization: {
    readablePrompt: '让 @图片1 挥手',
    templatePrompt: '让 <<<image_1_1>>> 挥手',
    modelPrompt: '让 【图片 1】 挥手',
    media: []
  },
  request: {},
  blockers: [],
  realReady: false,
  confirmationToken: ''
}
```

其中：

- `readablePrompt` 给产品、测试、运营看。
- `templatePrompt` 用来解释 Ark/即梦控制台中 `@素材` 的占位机制。
- `modelPrompt` 是进入模型文本部分的规范表达。
- `request` 是最终将要发给 Ark 的请求体。
- `blockers` 明确说明为什么不能真实生成。
- `confirmationToken` 只有在 `blockers.length === 0` 时才返回。

## 真实生成安全清单

打开真实生成前逐项确认：

- [ ] `APP_REAL_GENERATION_ENABLED=true` 只在受控环境配置。
- [ ] `ARK_API_KEY` 只存在服务端，日志、前端响应、截图、测试快照中都不出现。
- [ ] `PUBLIC_MEDIA_BASE_URL` 是公开 HTTPS 域名，且 Ark 能访问。
- [ ] 服务端会重新读取素材 ID，不接受前端伪造的 `remoteUrl`。
- [ ] `confirmationToken` 绑定当前请求 hash，且只能消费一次。
- [ ] `count` 个任务顺序创建，不做自动重试。
- [ ] Ark 部分失败时返回已创建成功的 `taskIds`。
- [ ] 查询轮询只查询已有 task，不重新创建任务。

## 测试门禁

迁移后至少运行：

```bash
npm run test -- src/view/videoGeneration/__tests__
npm run lint
npm run build
```

如果后端已迁移到 `hc-gpt-server`，还需要补充 Gin 层接口测试，覆盖：

- 上传文件中文名保留。
- MIME 伪造、截断图片、超大图片拒绝。
- Dry-run 不调用 Ark。
- 前端伪造 URL 不影响服务端权威素材。
- 真实生成缺少任一条件时返回 blocker。
- 确认 token 只能消费一次。
- Ark 部分失败时保留已创建 task ID。

## 开发者常见坑

1. **不要把 `@图片1` 当普通文本处理。** 它必须是 Tiptap 原子节点，否则删除、撤销、复制、序列化都会不稳定。
2. **不要用前端传来的 URL 做真实生成。** 前端只能提交素材 ID 和 realIndex，服务端必须重新取权威素材。
3. **不要在 Dry-run 里调用 Ark。** Dry-run 是无成本解释和校验入口。
4. **不要自动重试 `createTask`。** 付费任务的幂等性无法从网络错误中推断，重试可能造成重复扣费。
5. **不要把本地 `/uploads` 当真实生成 URL。** 这只适合浏览器预览；真实生成需要公开 HTTPS 或 Ark 资产。
6. **不要为了复刻方舟整页而扩大范围。** 当前 MVP 的迁移价值在 Composer 本身。

## 建议的上线流程

1. 先合入前端页面和 Dry-run 后端。
2. 在测试环境上传真实图片，确认 `@图片1` 插入、清空、删除、撤销、Dry-run 都正确。
3. 配置公开素材域名，但仍关闭 `APP_REAL_GENERATION_ENABLED`。
4. 检查 Dry-run blocker 从 `MEDIA_NOT_PUBLIC` 消失。
5. 在明确费用和参数后，只执行一次最低成本真实任务：`720P / 5秒 / 1条 / 无声`。
6. 成功后再开放给受控用户。
