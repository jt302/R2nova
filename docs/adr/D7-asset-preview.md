# D7 — 预览走 asset protocol

- 状态：已采纳
- 日期：2026-08-18

## 决策

Rust 把对象下到 `$APPCACHE`，前端 `convertFileSrc()` 转 `asset://`。PDF 用 `<iframe>`。Markdown 禁用 `rehype-raw`。

## 理由

Tauri IPC 走 JSON。几十 MB 媒体 base64 会打死 WebView。asset protocol 支持 Range，视频能 seek。R2 内容是不可信输入；WebView XSS 能 invoke 已注册 command，比浏览器严重。
