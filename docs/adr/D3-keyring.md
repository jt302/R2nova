# D3 — 凭据存储：keyring-core 4.x 架构

- 状态：已采纳
- 日期：2026-08-18

## 决策

不用 Stronghold。用 `keyring-core` 1.x + `apple-native-keyring-store` / `windows-native-keyring-store`。MSRV ≥ 1.88，工具链锁在 1.94.1。

测试用 `keyring_core::mock::Store`。

## 理由

`iota_stronghold` 停更且强制主密码。`keyring` 4.x docs.rs 明确说应用不应直接链接 `keyring`，应链 core + 平台 store。

不做 Linux，因此不需要 Secret Service / D-Bus 降级路径。

隐藏坑：macOS 钥匙串 ACL 绑定代码签名；未签名 dev 与已签名 release 是不同应用。
