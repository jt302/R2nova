# D9 — 首发不签名，更新走轻量检查

- 状态：已 superseded（2026-08-19）
- 日期：2026-08-18

## 决策

原决策：v1 走 Homebrew Cask + 未签名 DMG，不上 `tauri-plugin-updater`，启动时查 GitHub Releases API，提示 `brew upgrade`。

已改为 `tauri-plugin-updater`：关于弹窗内检查 / 下载安装 / `relaunch`。更新包用 minisign 私钥签名，公钥写在 `tauri.conf.json`。macOS 应用仍未做 Apple 代码签名，替换后 Gatekeeper 可能再拦；Homebrew Cask 安装后自更新会和 brew 记账不一致。

私钥只在密码管理器和 CI secret（`TAURI_SIGNING_PRIVATE_KEY`），不进 git。私钥丢失则无法给已安装用户推更新。
