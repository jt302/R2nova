# Security

## Trust boundary

The WebView is untrusted relative to R2 credentials. All signing, HTTPS, and file streaming happen in Rust. Frontend capabilities must not include `fs`.

## Credentials

- Access Key secret and Cloudflare API token are stored only in the OS keychain (`io.r2nova.app`).
- Profile metadata (no secrets) is `profiles.json` under the app data dir.
- Logs, toasts, and crash reports must not contain tokens, secrets, or presigned query strings.

## IPC

- Commands return `{ kind, message }`. Do not leak raw SDK traces that embed credentials.
- Markdown preview: no `rehype-raw`. Object bodies are attacker-controlled.
- CSP allows `ipc:` / `http://ipc.localhost` and `asset:` only for `$APPCACHE/**`. Presigned media preview may load `https://*.r2.cloudflarestorage.com` (and EU / FedRAMP hosts) in img/media/frame.

## Updates (v1)

Unsigned macOS builds. No `tauri-plugin-updater`. Version check is a GitHub Releases GET.

Generate the updater keypair on day one (`pnpm exec tauri signer generate -w src-tauri/.updater-key`) and **store the private key in a password manager**. Both `.updater-key` and `.updater-key.pub` are gitignored. Private key loss means you can never sign updates for existing installs. Switch to `tauri-plugin-updater` after code signing.

## Reporting

Open a private GitHub security advisory. Do not file public issues with exploit details.
