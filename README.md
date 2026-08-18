# r2nova

Desktop client for [Cloudflare R2](https://developers.cloudflare.com/r2/). Not another generic S3 browser: cost visibility, a real transfer engine, object organize (rename/move/copy), and the R2 control plane that only exists on Cloudflare’s REST API.

[中文说明](./README.zh-CN.md)

## Why

Dashboard caps uploads at 300 MiB, has no queue, no resume, and no folder hierarchy. Cyberduck / ForkLift / S3 Browser cannot reach lifecycle, CORS, custom domains, `r2.dev`, event notifications, bucket lock, or usage metrics. Transmit cannot fully speak R2 (`Transfer-Encoding: chunked`).

r2nova runs all network and crypto in Rust (Tauri 2). Access keys never enter the WebView.

## Features

- Multi-account profiles in the OS keychain, Admin vs Object-level token probing
- Lazy `ListObjectsV2` browser, virtualized table, reverse-set multi-select
- Equal-part multipart upload (R2 forbids unequal parts), resume, folder upload that keeps layout, drag-in
- Rename / move / cross-bucket copy (large objects use `UploadPartCopy`)
- Image / video / text / Markdown / PDF preview, presigned GET links
- CORS, lifecycle, `r2.dev`, custom domains, bucket lock, event notifications, usage
- Session Class A/B counters and quotes before expensive listings

**Not supported** (R2 itself): object versioning, tags, ACL, bucket policy, SSE-KMS/SSE-S3.

## Install

macOS via Homebrew Cask (unsigned DMG for v1):

```bash
brew tap r2nova/r2nova
brew install --cask r2nova
```

Windows: GitHub Releases NSIS installer.

## Develop

```bash
pnpm install
pnpm tauri dev
```

Requires Node 24.14.1 (`nvm use`), Rust 1.94.1 (see `rust-toolchain.toml`), pnpm 10. macOS 13+ / Windows 10+ with WebView2.

```bash
pnpm test          # Vitest
pnpm typecheck
cargo test --manifest-path src-tauri/Cargo.toml
```

Read [AGENTS.md](./AGENTS.md) and [docs/r2-constraints.md](./docs/r2-constraints.md) before touching S3 code.

## License

MIT
