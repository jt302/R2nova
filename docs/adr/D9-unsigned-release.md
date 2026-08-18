# D9 — 首发不签名，更新走轻量检查

- 状态：已采纳
- 日期：2026-08-18

## 决策

v1 走 Homebrew Cask + 未签名 DMG。不上 `tauri-plugin-updater`（自动替换后 macOS Gatekeeper 会重新拦截）。启动时查 GitHub Releases API，提示 `brew upgrade` 或手动下载。

第一天仍生成 updater 密钥对并备份进密码管理器（私钥不进 git）。上签名后再切 updater。

## 理由

未签名与 updater 插件冲突。密钥对必须提前备份：私钥丢失则无法给已安装用户推更新。
