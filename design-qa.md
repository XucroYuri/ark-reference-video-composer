# 设计与浏览器 QA 报告

结论：`final result: passed`

本报告记录最终交付前的无成本浏览器验证、视觉对比和已修复问题。验证范围严格限定在被标注的视频生成 Composer，不包含方舟控制台外壳、导航、图库、历史记录、登录态和浮动工具按钮。

## 1. 源站视觉依据

| 状态 | 文件 |
| --- | --- |
| 桌面端已插入 `@图片1` | `docs/design-references/ark-video-composer-reference-inserted.png` |
| 移动端默认空态 | `docs/design-references/ark-video-composer-mobile.png` |
| `@` 菜单展开 | `docs/design-references/ark-video-composer-mention-menu.png` |
| 已上传参考图 | `docs/design-references/ark-video-composer-reference-added.png` |

## 2. 实现截图

| 状态 | 文件 | 尺寸 |
| --- | --- | --- |
| 桌面端已插入 `@图片1` | `docs/design-references/ark-composer-implementation-desktop.png` | `1440 × 900` |
| 移动端默认空态 | `docs/design-references/ark-composer-implementation-mobile.png` | `390 × 844` |

并排对比图：

- `docs/design-references/ark-composer-comparison-desktop.png`
- `docs/design-references/ark-composer-comparison-mobile.png`

## 3. 运行环境

- 本地前端：`http://127.0.0.1:43127/#/video-generation`
- 本地服务端：`http://127.0.0.1:43128`
- 健康检查：`GET /api/health`
- 健康检查结果：

```json
{ "code": 0, "data": { "status": "ok" }, "msg": "服务正常" }
```

浏览器侧检查：

- in-app browser：路由可打开，无 console error。
- Chrome Extension：完整交互链路可验证，无 console error。

## 4. 无成本交互用例

验证步骤：

1. 使用任意符合上传要求的本地 PNG 或 JPEG 参考图。
2. 本地 API 上传素材，不向 Ark/即梦提交。
3. 页面显示 `图片1`，提交按钮可用。
4. 在编辑器输入 `让 @`。
5. `@` 菜单打开，键盘 `Enter` 插入原子节点 `@图片1`。
6. 继续输入 ` 挥手`，最终编辑器文本为 `让 @图片1 挥手`。
7. 打开参数面板，将声音改为 `无声`，保持 `720P / 5秒 / 1条`。
8. 点击提交，仅打开 Dry-run 预览。
9. 关闭预览，删除原子节点，验证撤销/重做。
10. 点击 `全部清空`，验证素材、编辑器、预览和按钮状态恢复空态。

验证结果：

- Dry-run 预览打开成功。
- 未触发 `createTask`。
- 未创建真实 Ark 任务。
- 未产生外部平台费用。

## 5. Dry-run 内容核对

Dry-run 预览中核对到以下结构：

| 项 | 结果 |
| --- | --- |
| 可读提示词 | `让 @图片1 挥手` |
| 控制台兼容模板 | `让 <<<image_1_1>>> 挥手` |
| 模型规范文本 | `让 【图片 1】 挥手` |
| 媒体映射 | `local://1058c93f-037f-4d0d-9e71-c3f2970e03b5` |
| 生成参数 | `adaptive / 720p / 5s / count=1 / generate_audio=false` |
| 真实生成状态 | 不满足条件，展示 blockers |

真实生成阻塞项符合预期：

- 真实生成未启用。
- 服务端未配置 `ARK_API_KEY`。
- 本地素材不是 Ark 可访问的公开 HTTPS URL 或 Ark 资产。

## 6. 浏览器上传限制说明

Chrome Extension 自动化文件上传被浏览器扩展权限拦截，底层错误为 `fileChooser.setFiles failed: Not allowed`。按 Chrome 扩展说明，需要在 `chrome://extensions` 中给 ChatGPT Chrome Extension 开启 “Allow access to file URLs”。

为保证 QA 可复现，本次采用以下无成本替代路径：

1. 先通过本地 API 上传同一张图片。
2. 在 development 模式下使用 URL 参数 `qaMedia` 把“已上传成功的素材元数据”注入页面。
3. 后续 `@` 菜单、原子节点、参数面板、Dry-run 预览全部走真实 UI。

该 `qaMedia` 入口只在 `import.meta.env.MODE === 'development'` 时生效，生产构建不会暴露。

## 7. 视觉对比结论

桌面端：

- Composer 宽度、圆角、边框、上传缩略图、`@图片1` 节点、参数栏、清空按钮、价格和提交按钮均符合源组件语义。
- 实现页没有方舟左侧导航、顶部模型栏和图库，这是范围内的主动裁剪，不算视觉缺陷。
- 组件在 standalone 页面中的垂直位置比源站更靠上，原因是外层 Ark shell 不在复刻范围。

移动端：

- 源站在 `390 × 844` 下不是移动端重排，而是保留宽布局并发生横向裁剪。
- 原型保留 Composer 最小宽度和横向裁剪行为。
- 裁剪位置与源站整页不同，原因是方舟侧栏和主内容偏移不在复刻范围。

## 8. 已修复问题

| 等级 | 问题 | 修复 |
| --- | --- | --- |
| P2 | 空任务面板显示 `idleidle`，源组件没有该可见区域。 | `GenerationTaskPanel` 在无任务且未提交时不渲染，只保留提交中和真实任务状态。 |
| P2 | 通过 Node/curl FormData 上传中文文件名时，Multer `originalname` 出现 latin1 乱码，Dry-run 媒体映射不可读。 | `server/media/store.js` 增加安全文件名解码；测试覆盖 `小豆Q版.png`。 |

## 9. 剩余 P3 说明

- standalone 原型不包含 Ark 外壳，因此全页对比中的导航、图库、浮动按钮差异是预期结果。
- Chrome 自动文件上传需要扩展权限；没有该权限时，QA 使用本地 API + development seed。
- 当前真实生成未配置公开素材域名和 `ARK_API_KEY`，因此只能验证到 Dry-run；这是成本保护边界，不是功能缺陷。

## 10. 自动化门禁

最终提交前已通过：

```bash
npm run test
npm run lint
npm run build
```

结果：

- `npm run test`：12 个测试文件，227 个测试通过。
- `npm run lint`：通过，0 warning。
- `npm run build`：通过；仅保留第三方依赖 PURE 注释和 chunk size 提示。

## 11. Task 10 收口浏览器复验（2026-07-17）

运行约束：

- 启动命令：`APP_REAL_GENERATION_ENABLED=false VITE_CLI_PORT=43127 VITE_SERVER_PORT=43128 npm run serve`
- 前端：`http://127.0.0.1:43127/#/video-generation`
- 健康检查：`GET http://127.0.0.1:43128/api/health` 返回 `{"code":0,"data":{"status":"ok"},"msg":"服务正常"}`。
- 全程未启用真实生成，也未发出 Ark 请求。

复验流程：

1. 输入非法 URL `not-a-url`，浏览器原生校验显示 `请输入网址。`。
2. 登记公开远程图片 `https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/1280px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg`，页面生成 `图片1`。
3. 输入 `镜头沿木栈道缓慢向前移动，树叶随微风轻轻摇曳`，通过 `@` 菜单插入原子节点 `@图片1`。
4. 确认参数为 `adaptive / 720p / 5s / count=1 / generate_audio=false`，打开 Dry-run 预览。
5. 最终 API 请求的 `content` 顺序为一个 `text` 项，随后一个 `image_url` 项；图片项的 `role` 为 `reference_image`，URL 与已登记的 Wikimedia URL 一致。
6. Dry-run 显示 `真实生成未启用` 和 `服务端未配置 ARK_API_KEY`。`real-generation-button` 数量严格为 `1` 且可见、禁用；强制点击后仍未发出请求，浏览器 Resource Timing 中 `/createTask` 请求计数保持为 `0`。
7. 任务历史在首屏未自动请求；显式点击 `加载历史` 后才进入加载路径。由于运行期开关关闭，该请求安全失败并显示 `加载任务历史失败，请稍后重试。`。状态筛选器仍可从 `全部` 切换到 `queued` 并恢复。
8. 最终浏览器 console：`0 error / 0 warning`。

截图与响应式结果：

| 视口 | 文件 | 结果 |
| --- | --- | --- |
| `1440 × 1000` | `docs/design-references/open-source-composer-desktop.png` | 页面 `scrollWidth = clientWidth = 1440`；520px Dry-run drawer 完整可见，主要操作可达。 |
| `390 × 844` | `docs/design-references/open-source-composer-mobile.png` | 通过：Dry-run drawer 边界为 `x=0 .. 390`，标题、请求、blockers 与禁用真实生成按钮均可见。 |

移动端最终测量：

- Composer 基础页面 `scrollWidth = clientWidth = 375`；参数 trigger 边界为 `x=131.656 .. 307.094`，完整位于 `x=8 .. 367` 的主内容区内。
- 生成参数 tooltip 边界为 `x=9 .. 375`、宽 `366px`，打开后页面仍为 `scrollWidth = clientWidth = 375`；比例控件可切换至 `16:9` 并恢复 `adaptive`。
- Dry-run drawer 边界为 `x=0 .. 390`、宽 `390px`，drawer 自身 `scrollWidth = clientWidth = 390`。
- drawer 内所有标题边界为 `x=20 .. 355`；五个 `<pre>` 块均满足 `scrollWidth = clientWidth`（前三个 `333px`，后两个 `318px`），无横向滚动条。
- 禁用的 `确认真实生成` 按钮保持可见；强制点击没有产生 `/createTask` 请求。最终浏览器 console 为 `0 error / 0 warning`。

`c2862c3` 后的最终 drawer overflow 复验：

- 桌面 `1440 × 1000`：document `clientWidth/scrollWidth = 1440/1440`；drawer `520/520`；drawer body `505/505`、`overflow-x: hidden`；长 JSON 的前三个 `<pre>` 为 `463/463`，媒体与请求块为 `448/448`。
- 移动 `390 × 844`：document `390/390`；drawer `390/390`；drawer body `375/375`、`overflow-x: hidden`；长 JSON 的前三个 `<pre>` 为 `333/333`，媒体与请求块为 `318/318`。
- 桌面和移动端 drawer body、preview 容器及所有长 JSON 块都满足 `scrollWidth <= clientWidth`，没有可见横向滚动条。
- 移动参数 tooltip 仍为 `x=9 .. 375`、`366px`，打开时 document 保持 `375/375`；禁用真实生成按钮为 `1` 个且 `enabled=false`；`/createTask=0`；console `0 error / 0 warning`。

产品提交 `c2862c3 fix: prevent preview drawer overflow` 的自动化证据：Composer `24` 项通过；全量 `14` 个测试文件、`390` 项测试通过；`npm run lint`、`npm run build` 与 `git diff --check` 均通过。

首次 Task 10 浏览器复验曾发现移动裁剪、参数面板横向溢出和 blocked-action 缺失；后续又发现桌面 drawer body 横向滚动条。产品提交 `097893b` 与 `c2862c3` 已依次修复，本次最终浏览器复验确认响应式几何、drawer body overflow 与无成本边界全部通过。

## 12. 最终结论

- 核心 `@图片N` 素材引用机制可复现。
- Dry-run 请求结构可解释、可验证、可迁移。
- 默认路径无成本，不会触发真实付费生成。
- Task 10 浏览器发现的移动端 drawer、参数面板与 blocked-action 问题均已修复并完成回归。

`final result: passed`
