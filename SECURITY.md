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

## Updates

`tauri-plugin-updater` verifies minisign signatures before install. The public key is in `tauri.conf.json`. The private key is not in git; CI uses `TAURI_SIGNING_PRIVATE_KEY`. Private key loss means existing installs can never receive signed updates.

macOS builds are still unsigned. Gatekeeper may re-prompt after an in-app replace.

## Reporting

Open a private GitHub security advisory. Do not file public issues with exploit details.
