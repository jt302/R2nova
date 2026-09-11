# Security

## Trust boundary

The WebView is untrusted relative to R2 credentials. All signing, HTTPS, and file streaming happen in Rust. Frontend capabilities must not include `fs`.

## Credentials

- Access Key secret, Cloudflare API token, and Analytics token are stored only in the OS keychain (`io.r2nova.app`): macOS Keychain, Windows Credential Manager, Linux Secret Service (GNOME Keyring / KWallet).
- Missing Secret Service is a hard failure (`kind: keyring`), never a mock store. AppImage talks to the host session bus.
- Profile metadata (no secrets) is `profiles.json` under the app data dir.
- Logs, toasts, and crash reports must not contain tokens, secrets, or presigned query strings.

## IPC

- Commands return `{ kind, message }`. Do not leak raw SDK traces that embed credentials.
- Markdown preview: no `rehype-raw`. Object bodies are attacker-controlled.
- CSP allows `ipc:` / `http://ipc.localhost` and `asset:` only for `$APPCACHE/**`. Presigned media preview may load `https://*.r2.cloudflarestorage.com` (and EU / FedRAMP hosts) in img/media/frame.

## Updates

`tauri-plugin-updater` verifies minisign signatures before install. The public key is in `tauri.conf.json`. The private key is not in git; CI uses `TAURI_SIGNING_PRIVATE_KEY`. Private key loss means existing installs can never receive signed updates.

macOS builds are still unsigned. Gatekeeper may re-prompt after an in-app replace.

Linux in-app updates install the AppImage artifact. `.deb` / `.rpm` installs are directed to GitHub Releases instead of `downloadAndInstall`.

## Reporting

Open a private GitHub security advisory. Do not file public issues with exploit details.
