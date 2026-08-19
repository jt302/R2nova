# Architecture

r2nova is a Tauri 2 desktop app. The WebView never talks to R2 or `api.cloudflare.com` directly.

```
React (FSD)  --invoke / Channel-->  Rust commands
                                   ├── s3/      aws-sdk-s3 client pool, list, multipart
                                   ├── cf/      Cloudflare REST + GET cache
                                   ├── transfer cooperative pause, equal parts, resume files, Range GET
                                   ├── creds    keyring-core + platform stores
                                   └── cost     Class A/B counters
```

## Frontend

| Dir | Role |
| --- | --- |
| `src/app` | providers |
| `src/pages` | shell (no router; navigation is `{bucket, prefix}` stacks) |
| `src/features` | browser, transfer, control, preview, command palette |
| `src/entities` | shared DTO types |
| `src/shared` | `tauriInvoke`, query keys, i18n, selection algebra |
| `src/store` | Zustand nav + live transfers |
| `src/components/ui` | tiny shadcn-style primitives |

Server state: TanStack Query. Do not poll `ListObjectsV2`.

## Backend

`commands/` is a thin IPC layer. Business rules live in `s3`, `cf`, `transfer`, `cost`.

S3 clients are pooled per `profileId + jurisdiction`. EU / FedRAMP use different hosts.

Transfer progress: one `ipc::Channel` per batch, 200ms throttle on the Rust side. Jobs enqueue as `queued` and run under a 1–16 job cap (default 5). Jobs persist in `queue.json`; multipart uploads keep equal-size part state in `*.resume.json`. Pause is cooperative. After a crash, `Running` jobs are parked as `Paused` and resume from the sidecar or a ranged GET. Downloads can use a remembered default folder.

## Platforms

macOS 13+ (Safari 18 / WKWebView) and Windows 10+ (Chrome 111 / WebView2). No Linux: keeps Vite `build.target` at `safari18` / `chrome111`, allows precompiled Shiki langs, and drops Secret Service fallbacks.

## Related docs

- [docs/r2-constraints.md](./docs/r2-constraints.md)
- [docs/adr/](./docs/adr/)
- [SECURITY.md](./SECURITY.md)
