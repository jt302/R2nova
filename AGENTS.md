# r2nova

> Cloudflare R2 专用桌面客户端。全部网络与加密在 Rust；WebView 只走 IPC。

改动 S3 / 分片 / 计费相关代码前，**必须先读** [`docs/r2-constraints.md`](docs/r2-constraints.md)。R2 违反大量 S3 直觉，凭 AWS 经验写代码会在运行时才炸。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面 | Tauri 2（macOS + Windows，不做 Linux） |
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind 4 + shadcn/ui |
| 服务端状态 | TanStack Query |
| 本地状态 | Zustand（导航栈、选择集、传输队列） |
| 表格 | TanStack Virtual，固定行高 28px |
| 后端 | Rust + `aws-sdk-s3` + Cloudflare REST (`reqwest`) |
| 凭据 | `keyring-core` + 平台 store（钥匙串 / Credential Manager） |
| Lint/Format | Biome（`pnpm check`） |
| Rust 工具链 | `rust-toolchain.toml` 锁 1.94.1 |

---

## 架构分层与 IPC 边界

```
src/          FSD：app / pages / widgets / features / entities / shared / store
src-tauri/    commands（薄）/ s3 / cf / transfer / creds / cost
```

| 必须 | 禁止 |
| --- | --- |
| 所有网络、签名、流式读写在 Rust | Access Key / Secret / CF Token 进入 JS |
| 前端只 `invoke` / `Channel` | 给前端宽泛 `fs` scope（`**`） |
| 预览走 `asset://`（`convertFileSrc`） | 媒体/大文件 base64 过 IPC |
| 传输进度用 `ipc::Channel`，Rust 侧 200ms 节流 | 用 event 系统推高频进度 |
| 错误返回 `{ kind, message }`，前端按 `kind` 分支 | 解析英文 error 字符串做逻辑 |

IPC 参数名与 `#[serde(rename_all = "camelCase")]` 对齐。类型镜像在 [`src/entities/profile/types.ts`](src/entities/profile/types.ts) 与 [`src/shared/api/backend.ts`](src/shared/api/backend.ts)。

---

## R2 约束（强制）

详见 [`docs/r2-constraints.md`](docs/r2-constraints.md) 与 ADR D1–D9。

| 必须 | 禁止 |
| --- | --- |
| 非末尾分片等长：`max(8MiB, ceil(size/10000)).round_up_to_mib()` | 变长分片（S3 允许，R2 报 `InvalidPart`） |
| `region` 只用 `auto` | 写 `us-east-1` 等 AWS 区域名当 R2 区 |
| Object 级 Token 探测失败后灰掉控制面 | 假定 REST 401 只是「权限不够还可以降级」 |
| `ListObjectsV2` 显式刷新，`max-keys=1000` | 自动轮询列表（Class A，$4.50/百万） |
| 列按 size/mtime 排序仅当 `hasNextPage === false` | 在游标分页未完成时假装全局排序 |
| 多选走反向集合 `include` / `all-except` | Table `rowSelection` 存 20 万 key |
| 右键菜单挂在容器上 | 每行一个 Radix ContextMenu |
| Cloudflare REST 全部走缓存，绝不浏览对象 | 用 REST 代替 `ListObjectsV2` |

**平台不支持，UI 不得承诺：** 对象版本、对象标签、ACL、bucket policy、SSE-KMS/SSE-S3、预签名 POST、自定义域名预签名。

---

## 安全红线

详见 [`SECURITY.md`](SECURITY.md)。

| 必须 | 禁止 |
| --- | --- |
| Secret 只进系统钥匙串 | 日志 / toast / 崩溃报告含 token |
| capabilities 最小权限，无 `fs` | `dragDropEnabled: false`（会丢掉绝对路径） |
| Markdown 预览禁用 `rehype-raw` | 把 R2 对象当可信 HTML |
| CSP 含 `ipc: http://ipc.localhost`；asset 仅 `$APPCACHE/**` | 把 `asset` scope 扩到整盘 |

macOS 钥匙串 ACL 与代码签名绑定：未签名 dev build 与已签名 release 会被当成不同应用。

---

## 前端规范

| 必须 | 禁止 |
| --- | --- |
| 路径别名 `@/` → `src/` | 相对路径爬出 FSD 边界 |
| 用户可见字符串走 i18n（`zh-CN` / `en-US`） | 硬编码中文/英文到 JSX |
| 导航用 Zustand `{ bucket, prefix }` 历史栈 | 引入 React Router |
| 应用内拖对象用 pointer events | HTML5 DnD（`dragDropEnabled: true` 会吞掉它） |
| Biome：tab、宽 100、单引号 | 再加 ESLint/Prettier |

---

## 测试

| 层 | 跑什么 |
| --- | --- |
| Rust | 分片算法、错误码映射、计费分类、key/prefix、凭据 mock store |
| Vitest | 选择集代数、路径解析。jsdom 需 `src/test-setup.ts` 补 `crypto.getRandomValues` |
| Windows CI | 无 Playwright（连不上 WKWebView/WebView2） |
| macOS | 手工验证；`tauri-driver` 不支持 macOS |

真实 R2 回归（Put/Get/Delete/分片）用专用测试桶。**不要一上来关掉 checksum**；Cloudflare 已修复 flexible checksums。CRC32 仅 COMPOSITE，FULL_OBJECT 只有 CRC64NVME。

---

## 注释

- 非平凡逻辑留**一个**可跑的检查（`#[cfg(test)]` 或 `*.test.ts`）。
- 故意简化且有已知上限的，用 `ponytail:` 注释写清天花板和升级路径。
- 用户可见注释/文档用中文；Rust/TS 标识符用英文。
