# Contributing

## Setup

Node 24.14.1, pnpm 10, Rust 1.94.1 (see `rust-toolchain.toml`). macOS 13+ or Windows 10+ with WebView2.

```bash
pnpm install
pnpm tauri dev
```

## Checks

```bash
pnpm check          # Biome
pnpm test
pnpm typecheck
pnpm release:check  # version numbers stay in sync
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Rules

1. Read [AGENTS.md](./AGENTS.md) and [docs/r2-constraints.md](./docs/r2-constraints.md) before S3/transfer/cost changes.
2. No new dependencies if stdlib / an existing crate already does it.
3. User-visible strings go through i18n.
4. Do not add object versioning, tags, ACL, bucket policy, or KMS UI — R2 does not support them.
5. Keep the diff small. Match Biome/rustfmt (tabs).

## Releases

Tag `vX.Y.Z`. GitHub Actions `release.yml` builds macOS + Windows via `tauri-apps/tauri-action@v1`. Bump `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` together (`pnpm release:check`).
