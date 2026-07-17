# 设计 Token 与源站样式记录

本文记录源站 Composer 的关键视觉 token。数值来自已登录源站页面的 `getComputedStyle()`、DOM 截图和浏览器取证。后续如果要继续做像素级调优，应优先回到这些 token，而不是凭肉眼猜测。

## 1. 取证状态

- 源站地址：`https://console.volcengine.com/ark/region:cn-beijing/experience/gen_video?model=doubao-seedance-2-0-260128`
- 主要取证会话：OpenCLI / 浏览器插件，已登录状态。
- 基准几何：源站 live `1280 × 723` 视口。
- 响应式截图：`1440 × 900`、`768 × 1024`、`390 × 844`。
- 旧的红箭头标注裁剪图只作为问题背景，不作为最终视觉依据。

## 2. Composer 外壳

| 项 | 源站值 |
| --- | --- |
| 选择器 | `form.agentic-sender` |
| 源站 class | `aml-arco-form aml-arco-form-horizontal aml-arco-form-size-undefined agentic-sender agentic-shell-lwLNKC` |
| `1280 × 723` 下边界 | `x=390`, `y=275`, `880 × 152px` |
| 布局 | `display:flex`, `flex-direction:column` |
| 尺寸 | `width:880px`, `height:152px` |
| 内边距 | `16px` |
| 背景 | `#FFFFFF` |
| 边框 | `1px solid #E0E0EB` |
| 圆角 | `16px` |
| 阴影 | `rgba(0,0,0,.04) 0 1px 3px` |
| 裁剪 | `overflow:hidden` |
| 基本文字色 | `#0B0B0F` |

## 3. 内部布局

| 元素 | 源站值 |
| --- | --- |
| 输入行 | `846 × 78px`; `display:flex`; `gap:16px`; 顶部对齐 |
| 上传区 | `86 × 78px`; 不收缩 |
| 提示词区 | `744 × 72px`; 占剩余空间；文本光标 |
| 富文本滚动壳 | `744 × 78px`; `min-height:78px`; 顶部补偿 `padding:6px 0 0`; `overflow:hidden auto` |
| 编辑器 | `744 × 52px`; `min-height:52px`; `white-space:break-spaces` |
| 段落 | `744 × 26px`; `margin:0`; `font:400 15px/26px` |
| 操作行 | `846 × 28px`; `margin-top:12px`; `display:flex`; `gap:8px`; 两端对齐 |
| 左侧控件 | `display:flex`; `gap:8px`; 可横向滚动 |
| 右侧提交区 | `display:flex`; `gap:4px`; 不收缩 |

## 4. 字体与文字

基础字体栈：

```css
Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ByteSans,
Arial, "Helvetica Neue", -apple-system, "system-ui", "noto sans",
Helvetica, sans-serif
```

| 角色 | 字体与颜色 |
| --- | --- |
| Composer 基础 | `400 14px/21px`, `#0B0B0F` |
| 提示词段落 | `400 15px/26px`, `#0B0B0F` |
| 上传缩略图标签 | `"PingFang SC"`, `400 11px/16px`, `#FFFFFF` |
| `@图片1` 文本 | `"PingFang SC"`, `400 15px/22px`, `#6C7191` |
| 全部清空 | `"PingFang SC"`, `400 12px/18px`, `#787C91` |
| 价格 | `400 13px/28px`, `#6E718C` |
| `@` 菜单 tab | `13px/20px`; 选中 `500`，未选中 `400` |
| `@` 菜单素材名 | `"PingFang SC"`, `400 15px/22px`, `#090911` |
| 空态 placeholder | 源截图栅格色约 `#B8BAC9` |

## 5. 上传区

| 元素 | 源站值 |
| --- | --- |
| 已上传素材滚动区 | `82 × 78px`; `display:flex`; `gap:6px`; `border-radius:10px` |
| 素材列表项 | `78 × 78px`; `position:relative`; `z-index:3` |
| 素材 tile | `78 × 78px`; `border-radius:12px`; `cursor:grab` |
| 缩略图 | `76 × 76px`; `object-fit:cover`; `object-position:50% 50%` |
| 覆盖标签 | `64 × 16px`; 省略号截断 |
| 加号按钮 | `24 × 24px`; 背景 `#F6F7FA`; 白色边框；圆角 `100px`; `z-index:21` |

上传图片取证文件：本地非真人 PNG 测试夹具（不纳入仓库）。

图片信息：

- 文件大小：`86,673` bytes
- 解码尺寸：`941 × 928`
- 用途：本地预览和浏览器 QA，不使用源站过期签名 URL。

## 6. 控件状态

| 控件 | 源站值 |
| --- | --- |
| 模式选择 | `110 × 28px`，文本 `参考生成` |
| 参数 trigger | `244.734 × 28px`; `padding:0 10px`; 边框 `#E0E0EB`; 圆角 `6px` |
| 独立 `@` 按钮 | `28 × 28px`; 白底；边框 `#E1E4F2`; 圆角 `6px` |
| 全部清空 | `81.1562 × 28px`; 透明背景；圆角 `6px` |
| 价格 | `120.344 × 28px`; `white-space:nowrap` |
| 提交按钮可用 | `28 × 28px`; 背景 `#5252FF`; 白色图标；圆角 `9999px`; `cursor:pointer` |
| 提交按钮禁用 | `28 × 28px`; 背景 `#ACB4FF`; `opacity:0.5`; `cursor:not-allowed` |

Hover 取证结果：提交、`@`、参数 trigger、全部清空在 hover 时没有背景、边框、阴影、透明度或 transform 的计算值变化。实现时不要额外发明缩放、浮起或阴影动画。

## 7. `@图片1` 原子节点

| 层 | 源站值 |
| --- | --- |
| 原子节点 | `<span class="react-renderer node-mediaTagSlot" contenteditable="false" draggable="true">` |
| 外框 | `84.0781 × 26px`; inline-block；右侧 `padding-right:3px`; 左侧 `margin-left:3px` |
| node-view wrapper | `81.0781 × 24px`; `vertical-align:top` |
| 对齐层 | `display:inline-flex`; `align-items:center`; `line-height:0`; `cursor:grab` |
| pill | `display:flex`; `gap:4px`; `margin:0 4px`; 圆角 `4px`; 不换行 |
| 缩略图 | `20 × 20px`; 圆角 `4px`; `object-fit:cover` |
| 文本 | `@图片1`; 颜色 `#6C7191` |

实现要求：

- Tiptap 文档里必须是 `mediaMention` 原子节点。
- 删除时要按节点整体处理，不能只删文本里的 `@`。
- 序列化时要用服务端权威素材 ID 和稳定 `realIndex`。

## 8. 浮层

### `@` 菜单

- portal 到 `body`，避免被 Composer 裁剪。
- 面板约 `160 × 103px`。
- 层级约 `z-index:9999`。
- 白底，边框 `#F0F2FA`，圆角 `12px`。
- 阴影：`rgba(0,0,0,.05) 0 15px 35px -2px, rgba(0,0,0,.05) 0 5px 15px`。
- 首个素材项在打开时就是键盘 active 状态。

### 参数面板

- Ark 源站 portal 层级约 `z-index:1000`。
- 内容尺寸约 `497 × 355px`。
- 白底，边框 `#E0E0EB`，圆角 `8px`。
- 字体 `400 12px/18.4615px`。

原型使用 Element Plus Popover 和原生 select 保持键盘可操作性。视觉不是逐像素复刻 Ark 私有组件，但交互语义和参数结构保持一致。

## 9. 响应式取证

| 截图 | 源站表现 |
| --- | --- |
| `1440 × 900` | Composer 完整可见，提交按钮在最右侧。 |
| `768 × 1024` | Composer 缩窄，提示词换行，控件仍保持一行。 |
| `390 × 844` | 方舟整页保持宽布局并横向裁剪，Composer 右侧和提交按钮不在可视区域。 |

不要从这三个点推导额外断点；实现只承诺这些目标视口的观察行为。

## 10. 视觉实现底线

- 使用真实参考图，不用占位块或手绘替代。
- 保留 `880px` 级别的 Composer 宽度语义。
- 保留圆角、边框、上传缩略图、操作行、价格和提交按钮状态。
- 空任务状态不显示面板。
- 只在 Dry-run 阶段验证视觉和请求结构。
