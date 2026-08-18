# D1 — 拖拽：`dragDropEnabled: true`

- 状态：已采纳
- 日期：2026-08-18

## 决策

保持 `tauri.conf.json` 窗口 `dragDropEnabled: true`。从桌面拖入的文件走 `onDragDropEvent` 拿绝对路径，交给 Rust 流式读取。

应用内「把对象拖到另一个目录」用手写 pointer events，不使用 HTML5 DnD。

## 理由

这是二选一：`true` 时 HTML5 `dragover`/`drop` 被屏蔽，但能拿到 `event.payload.paths`；`false` 只有浏览器 `File`，没有磁盘路径。上传器必须要路径。

官方文档写「只有 Windows 需要禁用」是错的，见 [tauri#14373](https://github.com/tauri-apps/tauri/issues/14373)。

虚拟化表格也不能每行挂 `dragstart`。
