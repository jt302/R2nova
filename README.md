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
brew tap jt302/r2nova
brew install --cask r2nova
```

Windows: GitHub Releases NSIS installer.

## Add an account

The add-account form asks for several fields. Screenshots below are from the Chinese dashboard (Aug 2026); English labels differ slightly. Official docs: [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/).

| r2nova field | Where to get it | Required |
| --- | --- | --- |
| Name | Anything; local label only | Yes |
| Account ID | R2 Overview → Account details | Yes |
| Access Key ID / Secret Access Key | R2 API token (the S3 pair) | Yes |
| Cloudflare API Token | My Profile → API Tokens | No. Only for CORS, lifecycle, custom domains |
| Jurisdiction | Change only if the bucket is EU / FedRAMP | Leave Default |

You do not paste the S3 API endpoint. r2nova builds it.

### 1. Open R2

[Cloudflare dashboard](https://dash.cloudflare.com/) → **Storage & Databases** → **R2 Object Storage**.

![Sidebar to R2](docs/images/add-account/01-nav-r2.png)

### 2. Copy the Account ID

In **Account details** on the right, copy **Account ID** (32 hex characters, not your login email). Then **Manage API Tokens**.

![Account details](docs/images/add-account/02-account-id.png)

### 3. Create an R2 API token (Access Key)

For personal use, **Create User API token**. For production, use an Account API token (Super Administrator).

![Create R2 API token](docs/images/add-account/03-r2-api-tokens.png)

Set permissions to **Object Read and Write** (the form often defaults to Object Read only, which cannot upload). Apply to all buckets; TTL forever is fine.

![R2 token permissions](docs/images/add-account/04-r2-token-permissions.png)

You get an **Access Key ID** and **Secret Access Key**. The secret is shown once.

These are S3 credentials: browse and transfer only. CORS, lifecycle, custom domains, and `r2.dev` need the next token.

### 4. (Optional) Cloudflare API Token

[My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token** → **Custom token** → **Get started**.

Permission: **Account** → **Workers R2 Storage** → **Edit**. Leave account resources as Include / All accounts.

![Custom API token](docs/images/add-account/05-cf-custom-token.png)

### 5. Paste into r2nova

Open r2nova → **Add account**, paste the values, save.

![r2nova add account](docs/images/add-account/06-r2nova-form.png)

After save, r2nova probes: listing buckets → Object-level. A working Cloudflare API Token → Admin, which unlocks the control plane.

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
