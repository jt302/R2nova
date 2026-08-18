# r2nova 竞品调研与功能清单

> 调研时间：2026-08-18 ｜ 目标：Cloudflare R2 专用桌面 GUI 客户端（Tauri 2 + React）
> 所有事实性结论均附来源链接。凡二手/营销来源已标注可信度。

---

## 摘要

三条最重要的结论：

1. **官方 Dashboard 在 2026 年已补上"清空桶 / 删文件夹"，但仍然没有重命名、没有移动、没有文件夹上传、没有传输队列、单文件上传受限。** 这些正是我们的主战场。
2. **通用 S3 客户端（Cyberduck / Transmit / ForkLift / S3 Browser / brows3）结构性地做不到 R2 专属能力**——生命周期、CORS、自定义域、公开访问、事件通知、jurisdiction、用量指标全在 Cloudflare 自己的 REST API 上，不在 S3 API 上。Transmit 更是官方声明"无法完整支持 R2"。
3. **R2 专用工具生态很碎：没有一个"桌面原生 + 功能完整 + 活跃维护 + 有口碑"的开源项目。** 星最多的 [R2-Explorer](https://github.com/G4brym/R2-Explorer)（617★）是部署到 Workers 的 Web 应用，它的"批量删除""文件夹下载"issue 从 2024 年 1 月挂到现在；桌面侧全是 1–150★ 的小项目，多数只做"上传 + 浏览"。

---

## 任务一：竞品分析

### 1. Cloudflare 官方 R2 Dashboard（最重要的替代对象）

**定位**：R2 的账号控制台，顺带一个对象浏览器。
**技术栈**：Cloudflare Dashboard SPA，后端走 `api.cloudflare.com/client/v4` REST API。

**2026 年的真实能力（已核实，勿按旧印象判断）**

| 能力 | 状态 | 来源 |
| --- | --- | --- |
| 上传文件（拖拽/选择） | ✅ | [Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) |
| 创建"文件夹"（写 0 字节 `key/` 占位对象） | ✅ | 同上 |
| 清空整个 bucket（后台执行 + 进度） | ✅ **2026-04-30 新增** | [Changelog](https://developers.cloudflare.com/changelog/post/2026-04-30-r2-empty-bucket-folder-delete/) |
| 按前缀删除"文件夹" | ✅ **2026-04-30 新增** | 同上 |
| 生命周期规则 / CORS / 自定义域 / 公开访问 / 事件通知 / Bucket lock / 存储类 / jurisdiction | ✅ | [Buckets](https://developers.cloudflare.com/r2/buckets/) |
| 用量指标（Class A/B、存储） | ✅（GraphQL 数据源） | [Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/) |

**明确的短板（这些就是产品机会）**

| 短板 | 证据 |
| --- | --- |
| **单文件上传受限**：Dashboard 提示超过 300 MB 需改用 API/Wrangler（实际口径是 300 MiB ≈ 315 MB）。当前文档已不再明写该数字，但 Wrangler 至今仍是"最多 315 MB，且一次只能一个对象" | [cloudflare-docs#5011](https://github.com/cloudflare/cloudflare-docs/issues/5011)、[社区实测口径](https://www.answeroverflow.com/m/1046544097273450617)、[Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) |
| **不支持保留层级的文件夹上传**：文档的 Dashboard 步骤只写"drag and drop your **file**"，需要传目录时官方直接让你用 `rclone copy` | [Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) |
| **没有重命名 / 移动**：从 2024 年问到 2026 年，官方与社区的答案始终是"S3/R2 没有 rename，你得 CopyObject + DeleteObject，或者用 rclone move" | [社区：How to Edit Object Names](https://community.cloudflare.com/t/how-to-edit-object-names-in-cloudflare-r2-bucket/690783)、[社区：More file/folder renaming/moving](https://community.cloudflare.com/t/r2-more-file-folder-renaming-moving/647601)、[Discord 提问](https://www.answeroverflow.com/m/1261603834120372274) |
| **没有传输队列 / 断点续传 / 并发控制**：上传中断即从头再来 | 文档无相关能力；对比 S3 Browser、ForkLift 均有 |
| **浏览本身在花钱**：Cloudflare 官方确认"打开 bucket 页面会 list 对象，这是一次计费操作；点开对象看元数据也是" | [Discord 官方答复](https://www.answeroverflow.com/m/1452722940146745355) |
| **搜索只有前缀**：`ListObjectsV2` 只支持 `prefix` / `delimiter` / `start-after`，每次最多 1000 条，无 glob、无按大小/时间排序 | [S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)、[Wrangler list 特性请求中 Cloudflare 的解释](https://github.com/cloudflare/workers-sdk/issues/3009) |
| **0 字节占位对象会"卡住"删除**：用 Add directory 建的 `dev/` 对象在默认视图里看不见，导致桶删不掉，官方要用户去关掉"View prefixes as directories" | [Discord 排障](https://www.answeroverflow.com/m/1452722940146745355) |
| 浏览器形态：凭据不落地、每次登录、无本地缓存、跨账号需切换 | — |

**可借鉴**：bucket 设置页的信息组织（Empty / Delete / Lifecycle / CORS / Public access 分区）值得照抄，用户已有肌肉记忆。

---

### 2. Cyberduck / Mountain Duck

**定位**：老牌多协议开源传输客户端（GPL），Mountain Duck 是同厂的"挂载为本地盘"付费版。
**技术栈**：Java 核心 + macOS/Windows 原生绑定；provider 差异用声明式 `.cyberduckprofile` 表达。
**核心功能**：FTP/SFTP/WebDAV/S3/GCS/Azure/B2/Dropbox/Google Drive 等；书签、Keychain、编辑器直改远端文件。R2 有官方 connection profile。

**明显短板**

- **区域/签名坑长期存在**：使用 R2 profile 时报 `The region name 'ap-southeast-1' is not valid. Must be one of: wnam, enam, weur, eeur, apac, auto`。维护者确认根因是 R2 profile 缺 `Region` 覆盖；issue 2024-09 提出，虽已修复，但 **2026-06 仍有用户报告 9.5.0 连上一次后反复索要 secret key**。（[issue #16377](https://github.com/iterate-ch/cyberduck/issues/16377)）
- **jurisdiction 桶（`<acct>.eu.r2.cloudflarestorage.com`）连不上**：因为区域参与 SigV4 签名。（[discussion #16027](https://github.com/iterate-ch/cyberduck/discussions/16027)）
- **对 R2 的认知停留在 open beta**：官方帮助页至今写着"不支持 pre-signed URLs / ACLs / 指定 region"，而 R2 早在 [2022-06-17](https://developers.cloudflare.com/r2/platform/release-notes/) 就支持了 presigned URL。（[Cyberduck 帮助页](https://docs.cyberduck.io/protocols/s3/cloudflare/)、[Mountain Duck 帮助页](https://docs.mountainduck.io/protocols/s3/cloudflare/)）
- 通用抱怨（大量小文件时列目录卡、单窗格、队列可见性弱）在若干论坛聚合站有描述，但那些站点疑似 AI 生成的 SEO 内容，**不作为独立证据**，仅与 GitHub issue 的现象相互印证。

**可借鉴**：**connection profile 的思路**——把 provider/endpoint/region/签名差异做成声明式配置而不是硬编码分支。这对我们支持 jurisdiction 端点特别有用。

---

### 3. Transmit 5（Panic，macOS 付费）

**定位**：macOS 上打磨最好的商业传输客户端。

**关键事实（决定性的）**：Panic 官方明确写着 **"Transmit is not able to fully support Cloudflare's R2 service at this time."** 原因是 Transmit 为性能只做流式传输，会设置 `Transfer-Encoding: chunked`，而 R2 不支持。（[Panic 帮助页](https://help.panic.com/transmit/transmit5/cloudflare-r2/)、[Cloudflare 社区中 Panic 支持的回复](https://community.cloudflare.com/t/uploading-files-to-r2-via-transmit-or-similar-desktop-client/393560)）

**S3 侧能力**：>5 GB 自动 multipart，单文件上限 976 GB；官方还提醒失败的 multipart 分片会残留并计费，建议配 lifecycle 规则清理。（[Amazon S3 in Transmit 5](https://help.panic.com/transmit/transmit5/s3/)）

**可借鉴 / 教训**：
- 教训：**绝不能依赖 `Transfer-Encoding: chunked`**，必须走"已知长度 + 显式 multipart"。这是一个成熟商业产品被 R2 挡住的真实案例。
- 借鉴：Panic 那种"上传完立刻给你可用 URL"的心流，以及对失败分片计费的主动提示。

---

### 4. S3 Browser（现更名 CS Browser，NetSDK，Windows）

**定位**：Windows 上的重型 S3 运维工具，闭源。免费版仅限个人使用，Pro $39.99 / 3 台。
**核心功能（这部分很值得抄）**：2008 年起持续开发的传输引擎、**多段上传/下载可暂停可恢复**、未完成任务自动保存并在重启后恢复（**复用已有的 multipart upload 而不是重传**）、数据完整性校验、客户端压缩 + AES-256 加密、文件夹同步（只传新增和变更）、百万级对象处理、版本管理、全部存储类、CloudFront 管理。（[官网](https://s3browser.com/)、[上传下载说明](http://s3browser.com/how-to-upload-and-download-files.php)）

**明显短板**：Windows 独占；UI 陈旧；**免费版并发上传/下载硬限 2 线程**，超过 2 需付费；商业用途必须买 Pro；对 R2 无任何专门适配。（[并发限制的第三方文档](https://docs.revealdata.com/reveal-2025-12/docs/administer-use-s3-browser-pro-processing)）

**可借鉴**：**传输队列持久化 + multipart 复用恢复**，这是本次调研里最值得直接照抄的一个设计。

---

### 5. ForkLift 4 / Commander One（macOS 文件管理器）

| | ForkLift 4（BinaryNights） | Commander One（Eltima） |
| --- | --- | --- |
| 定位 | macOS 双栏文件管理器 + 传输客户端 | Total Commander 风格双栏管理器 |
| 技术栈 | Swift 原生 | Swift 原生 |
| 价格 | $19.95/1 年 或 $34.95/2 年（到期可继续用旧版，不给新版） | 免费 + PRO $29.99 一次性 |
| S3 / R2 | 原生一等支持 S3 及 S3 兼容 | 需 PRO，且部分能力仅站点版 |
| 强项 | 传输队列（后台 + ETA + 暂停恢复 + 错误恢复）、连接掉线重试、Sync & Compare 目录对比同步、同步浏览 | 挂载为本地盘（让 Photoshop/Logic 直接读云端）、压缩包内浏览、F 键体系、高度可定制 |
| 协议 | SFTP/FTP/FTPS/WebDAV/S3/B2/Google Drive/OneDrive/Dropbox/SMB/AFP/NFS/VNC | SFTP/FTP/FTPS/WebDAV/S3/B2/Dropbox/GDrive/OneDrive/pCloud/Mega/Swift |

来源：[ForkLift 手册](https://binarynights.com/manual)、[Commander One App Store 页](https://apps.apple.com/us/app/commander-one-file-manager/id1035236694)。两者的横评来自若干疑似 AI 生成的对比站，**仅用于交叉印证功能矩阵，不引用其结论**。

**共同短板**：都是"通用文件管理器 + S3 兼容"，**零 R2 专属能力**——没有生命周期、CORS、自定义域、公开访问开关、事件通知、Class A/B 成本视图。ForkLift 是订阅制且 macOS 独占。

**可借鉴**：双栏 + 传输队列 + 目录对比同步这三件套；Commander One 的"挂载为盘"是我们明确应该**不做**的（复杂度极高，rclone mount / Mountain Duck 已覆盖）。

---

### 6. rclone / rclone GUI

**定位**：CLI 事实标准（Go）。**在 R2 生态里，rclone 是 Cloudflare 官方和社区对所有批量问题的默认答案**——批量删除、重命名、文件夹上传、清空桶，全部指向 rclone。（[社区：bulk delete](https://community.cloudflare.com/t/deleting-files-in-bulk-on-r2-seems-too-complicated/599542)、[社区：删文件夹](https://community.cloudflare.com/t/delete-an-object-containing-multiple-folder-and-images-inside-in-r2-bucket/693860)）

**GUI 现状**：v1.74 起官方 Web GUI 已内嵌进二进制，`rclone gui` 直接起（[rclone gui 文档](https://rclone.org/gui/)、[rclone/rclone-web](https://github.com/rclone/rclone-web)）；第三方还有 [yet-another-rclone-dashboard](https://github.com/outlook84/yet-another-rclone-dashboard/) 对接 `rclone rcd`。

**强项**：sync/copy/move/purge/check、断点、并发、限速、crypt 加密、mount。
**短板**：`rclone config` 交互式配置的心智负担；GUI 是 Web 而非原生，且面向"远端/挂载/任务"而不是"文件浏览"；R2 上有已知坑——`purge` 因 `GetBucketVersioning` 返回 403 而失败、`aws s3 sync` 的 multipart 需限制并发。（[Unofficial R2 notes](https://gist.github.com/johnspurlock-skymethod/6027c81953f81aa535d889d86a1061ba)）

**可借鉴**：sync 的判定逻辑（size + mtime/ETag）和 `--dry-run` 心智。**不要把 rclone 当依赖打包进来**——多一个外部二进制就多一堆分发、版本、路径问题；同步逻辑本身并不难，自己实现更可控。

---

### 7. R2 专用工具（现有开源项目盘点）

| 项目 | 形态 | 技术栈 | Star | 活跃度 | 做到了什么 / 卡在哪 |
| --- | --- | --- | --- | --- | --- |
| [G4brym/R2-Explorer](https://github.com/G4brym/R2-Explorer) | 部署到 Workers 的 Web 应用（Google Drive 风格） | TypeScript + Vue，MIT | **617★** / 521 fork | 活跃（v1.2.0，2026-04；最后推送 2026-06） | 多 bucket 绑定、Basic Auth / Cloudflare Access、读写开关、前缀搜索、公开 URL 复制、Email Explorer。**但 [issue 列表](https://github.com/G4brym/R2-Explorer/issues)里"批量删除"(#55) 和"文件夹下载"(#57) 从 2024-01 挂到现在；#155 分享链接失效、#154 非 ASCII 文件名下载损坏** |
| [maoxiaoke/r2Uploader](https://github.com/maoxiaoke/r2Uploader) | 桌面 | Electron 系（含 `Setup.exe`），GPL-3.0，**需 license key 付费**（有免费额度） | 119★ | 一般 | 定位"给非技术用户的上传/分享助手"：Masonry 图片浏览、前缀搜索、自定义域链接、重名检测。[官网](https://r2-uploader-puce.vercel.app) 明确未来计划仅为按时间过滤等小功能。无同步、无批量运维、无 bucket 配置 |
| [dickwu/r2](https://github.com/dickwu/r2) | 桌面 | **Tauri + Next.js + React** | 57★ / 0 fork | 新 | 直接对标物：R2/S3/MinIO/RustFS 多账号、可恢复 multipart、图片/视频/PDF/代码预览、跨 provider 移动、挂载为本地盘、brew tap 分发 |
| [cced3000/Cloudflare-R2-Desktop-Client](https://github.com/cced3000/Cloudflare-R2-Desktop-Client)（r2client.com） | 桌面 | **Tauri + React** | 1★ | 低 | 多语言、深浅主题、拖拽上传、本地缓存。技术栈与我们完全重合，但没有用户 |
| [binnacle-app/Binnacle](https://github.com/binnacle-app/Binnacle) | 桌面 | Rust + GPUI，MIT | 17★ | 新（2026-04 创建） | D1 + R2 + KV 一体化工作台，macOS preview。思路值得注意：**把 Cloudflare 数据服务收进一个原生壳** |
| [cheerawab/Cloudflare-R2-FileManager](https://github.com/cheerawab/Cloudflare-R2-FileManager) | 桌面 | Electron + React + shadcn/ui + aws-sdk-js | 1★ | 低 | 虚拟文件夹、深色模式、中英双语 |
| [CLBray/r2-browser](https://github.com/CLBray/r2-browser) | Web（Workers + R2 binding） | React + Hono | 低 | 实验 | README 自陈 PoC、未经评审、不可用于生产 |
| [neverinfamous/R2-Manager-Worker](https://github.com/neverinfamous/R2-Manager-Worker/wiki/Folder-Management) | Worker | TS | 低 | — | 值得读它的[文件夹管理实现](https://github.com/neverinfamous/R2-Manager-Worker/wiki/Folder-Management)：rename/copy/move 都是"批 100 个 + 每批 300–500ms 延迟"，并给了各量级的耗时预期 |
| 商业闭源：STOFOX、R2Drop | 桌面 | — | — | — | [STOFOX 推广文](https://medium.com/@uayyildiz/stofox-the-missing-desktop-client-for-cloudflare-r2-8535f10db1a6) 的卖点就是"R2 没有官方桌面客户端 / Dashboard 批量操作困难 / 不支持文件夹上传"；[R2Drop](https://r2drop.com/blog/r2drop-vs-cloudflare-dashboard) 只做上传（Finder 右键、菜单栏拖放、CLI、上传后自动复制 URL），并坦承浏览和账号管理仍要回 Dashboard。**这两家是营销内容，其功能主张不作为事实引用，但它们选择的痛点与我们独立核实的一致** |

**结论**：需求真实存在（多个团队独立在做），但**没有一个开源项目同时满足"R2 专用 + 桌面原生 + 功能完整 + 活跃维护"**。R2-Explorer 星最多，恰恰因为是 Web/Worker 形态而在批量与大文件上做不动。这是空位。

---

### 8. Tauri 系存储客户端（实现参考）

| 项目 | Star | 技术栈 | 值得抄的点 |
| --- | --- | --- | --- |
| [rgcsekaraa/brows3](https://github.com/rgcsekaraa/brows3) | **148★**，MIT | Tauri + Rust + Next.js | **最直接的技术参考**。主打大 bucket 浏览速度：prefix-aware 对象缓存（用缓存的 key 拼出目录视图，减少重复 List 调用）、本地缓存、虚拟化对象表格、带上限的递归深搜。它把"S3 专注 + 速度"当作对 Cyberduck 的差异点 |
| [ZeroGDrive/bucket-scout](https://github.com/ZeroGDrive/bucket-scout/) | 7★ | Tauri 2 + React + TanStack Router + TailwindCSS + shadcn/ui + aws-sdk-rust + Turborepo/Bun | 与 r2nova 栈几乎一致，可参考工程结构（`apps/web/src` + `apps/web/src-tauri`）；有 bucket 创建/强制删除、拖拽、自动更新 |
| [ODudek/s3deck](https://github.com/ODudek/s3deck) | 3★ | Tauri + React + Tailwind v4 + aws-sdk-rust | Tauri IPC 直连（前端不碰 SDK）、JSON 本地配置、命令清单设计（`get_buckets` / `add_bucket` / …） |
| [moonrailgun/s3-file-viewer](https://github.com/moonrailgun/s3-file-viewer) | 1★ | Tauri + React + Mantine + aws-sdk-rust | 列表/缩略图双视图、一键复制 URL |

**收敛出的公共技术选择**：Rust 侧用 **aws-sdk-rust** 说 S3，前端 React + Tailwind/shadcn，配置本地 JSON，全部经 Tauri IPC（凭据不进渲染进程）。
**它们普遍没做好的一件事：凭据存储**。多数只说"存在本地"。我们应该走 OS keychain（macOS Keychain / Windows Credential Manager / libsecret），这是低成本高价值的差异。

---

## 任务二：功能清单（Feature Inventory）

优先级：**P0** 必须有（MVP 不可缺）｜**P1** 重要（v1 应有）｜**P2** 锦上添花
复杂度：低 / 中 / 高

### A. 连接与凭据管理

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| S3 凭据连接（Account ID + AK/SK，自动拼 endpoint，region 固定 `auto`） | P0 | 低 | R2 的 region 只接受 `auto`（空值与 `us-east-1` 别名到 `auto`） |
| 凭据存 OS keychain，配置与密钥分离 | P0 | 低 | 用 `keyring` crate 或 tauri keychain 插件；竞品普遍薄弱处 |
| 多账号 / 多 profile，快速切换 | P0 | 低 | |
| 连接自检 + 可诊断错误（区分 token 权限不足 / 桶不存在 / 签名区域错） | P0 | 低 | 只读 token 无 ListBuckets 权限时必须让用户手填桶名，Cyberduck 就在这里劝退过人 |
| jurisdiction 端点（`<acct>.eu.r2.cloudflarestorage.com`、FedRAMP） | P1 | 低 | **Cyberduck 在这翻过车，做对就是加分项** |
| Cloudflare API Token 连接（用于 bucket 配置面 / 指标） | P1 | 中 | 与 S3 AK/SK 是两套东西，UI 上要讲清 |
| 只读 / 生产环境标记 + 危险操作二次确认 | P1 | 低 | |
| 从 `rclone.conf` / `~/.aws/credentials` 导入 | P2 | 低 | 迁移摩擦一次性抹掉 |
| 生成临时凭据（`/r2/temp-access-credentials`，可按前缀/动作限权） | P2 | 中 | [Temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/) |

### B. 对象浏览与导航

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| prefix + delimiter 目录视图 + 面包屑 | P0 | 低 | |
| 虚拟化列表（万级对象不掉帧） | P0 | 中 | brows3 的核心卖点，属于必须对齐 |
| 分页 / 无限滚动（continuation token，1000/页） | P0 | 低 | |
| 对象详情面板（size / ETag / storage class / HTTP metadata / custom metadata / checksum） | P0 | 低 | |
| 目录/扁平 raw key 视图切换 | P1 | 低 | 用于揪出隐藏的 0 字节占位对象——Dashboard 用户在这卡过 |
| prefix 级本地缓存（减少重复 List → 直接省 Class A） | P1 | 中 | 既是性能也是成本优化 |
| 列表 / 网格（缩略图）双视图 | P1 | 中 | |
| 排序，并诚实标注"仅对已加载范围排序" | P1 | 低 | S3 API 只能按 key 字典序，不能按时间/大小排 |
| 双栏 / 双 bucket 并排 | P2 | 中 | ForkLift 的核心体验，但不是 MVP |

### C. 上传 / 下载 / 传输

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 拖拽上传文件 | P0 | 低 | |
| **文件夹上传（保留完整层级，含子目录）** | P0 | 中 | Dashboard 的头号缺口 |
| 客户端 multipart（超阈值自动切片；5 MiB–5 GiB/片；**除最后一片外必须等长**；≤10000 片） | P0 | 中 | 等长约束违反会得到 `InvalidPart`，[distribution#3873](https://github.com/distribution/distribution/issues/3873) 就是这个坑 |
| **断点续传**（持久化 upload id + 各 part 状态，重启后复用而非重传） | P0 | 高 | 抄 S3 Browser 的设计 |
| 持久化传输队列（暂停/恢复/取消/重试/排序） | P0 | 中 | |
| 并发控制（全局并发 + 单任务分片并发） | P0 | 中 | 注意同一 key 写入上限 1 次/秒，超了返回 429 |
| 下载文件 / 按前缀递归下载文件夹 | P0 | 中 | R2-Explorer 挂了两年的 issue |
| 冲突策略（跳过 / 覆盖 / 自动重命名 / 按 ETag 比对） | P1 | 低 | |
| 上传时设置 Content-Type、Cache-Control、Content-Disposition、storage class、custom metadata | P1 | 低 | PutObject 全支持 |
| 断点下载（Range 分段） | P1 | 中 | |
| 完整性校验（CRC-64/NVME 全对象；单片 MD5） | P1 | 中 | R2 的 FULL_OBJECT 只支持 CRC64NVME |
| 跨 bucket 服务端复制（CopyObject；>5 GiB 走 UploadPartCopy） | P1 | 高 | 跨账号需本地中转 |
| 带宽限速 | P2 | 中 | |
| 从 URL 直接拉取入桶 | P2 | 中 | |

> ⚠️ 实现红线：**绝不能使用 `Transfer-Encoding: chunked`**——R2 不支持，这正是 Transmit 无法支持 R2 的原因。所有 PUT/UploadPart 必须带确定的 Content-Length。

### D. 对象操作

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 单个 / 多选批量删除（DeleteObjects 每批 1000） | P0 | 低 | |
| 按前缀递归删除（"删文件夹"，带进度、可取消） | P0 | 中 | |
| **重命名**（CopyObject + DeleteObject，可选保留或替换元数据） | P0 | 中 | Dashboard 至今没有 |
| **移动**（同桶跨前缀，服务端 copy + delete，批量 + 进度） | P0 | 中 | 同上 |
| 复制（同桶 / 跨桶） | P0 | 中 | |
| 大对象移动/重命名走 UploadPartCopy 分片 | P1 | 高 | CopyObject 单次上限 5 GiB |
| 批量改元数据（`x-amz-metadata-directive: REPLACE`，典型场景：批量修 Content-Type / Cache-Control） | P1 | 中 | 很实用，且没人做 |
| 新建"文件夹"（0 字节 `key/`） | P1 | 低 | 同时提供"清理空占位对象" |
| 未完成 multipart 管理（ListMultipartUploads + AbortMultipartUpload） | P1 | 低 | 直接省钱，见 F 节 |
| 识别 bucket lock 并禁用删除按钮 | P2 | 低 | Cloudflare 自己 2025-09 才修好这个 bug |
| 操作历史 + 反向操作脚本（不做真 undo） | P2 | 中 | |

> ❌ **R2 不支持、不要做**：对象版本控制（`Get/PutBucketVersioning` 未实现）、对象标签（`Get/Put/DeleteObjectTagging` 全部未实现）、ACL、bucket policy、website、replication、inventory、SSE-KMS。依据：[S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)。

### E. 预览与分享

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 图片 / 视频 / 音频 / PDF / 文本 / 代码 / Markdown 预览 | P0 | 中 | 大文件用 Range 流式，不要整体下载 |
| presigned GET 分享链接（可设有效期） | P0 | 低 | 只支持 GET/HEAD/PUT/DELETE；**不能用自定义域，只能用 S3 域名**；POST 表单上传不支持 |
| 复制公开 URL（`r2.dev` 或自定义域，按 bucket 公开状态自动判断） | P0 | 低 | `r2.dev` 有变动速率限制，非生产用途，UI 要提示 |
| 批量复制链接（换行列表 / Markdown / HTML 多格式） | P1 | 低 | |
| presigned PUT 上传链接（让他人上传） | P2 | 低 | |

### F. Bucket 管理

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 列出 / 创建 bucket（location hint、jurisdiction、默认存储类） | P0 | 低 | |
| 删除 bucket（含"先清空"引导 + 批量删进度） | P0 | 中 | 桶必须为空才能删；有 lock 规则时不能清空 |
| CORS 规则编辑 | P1 | 低 | S3 API 直接支持 Get/PutBucketCors |
| 生命周期规则编辑（过期删除 / 转 IA / abort MPU） | P1 | 中 | 转 IA 会产生一次 Class A，UI 要说明 |
| 公开访问开关（`r2.dev` managed domain 启停 + 限流警告） | P1 | 低 | 需 Cloudflare REST API |
| 自定义域绑定/解绑 + minTLS / ciphers | P1 | 中 | 需 Cloudflare REST API |
| 用量总览（对象数 / 总大小） | P1 | 中 | **务必走指标 API，不要全量 List 去数** |
| 事件通知（绑定 Queue、prefix/suffix、actions） | P2 | 中 | 需 Cloudflare REST API |
| Bucket lock 规则 | P2 | 中 | |
| Sippy / Super Slurper 迁移入口 | P2 | 中 | |

> Cloudflare REST API 有 **1200 请求 / 5 分钟** 的账号级速率限制，配置类操作走它、数据类操作走 S3 API。依据：[Limits](https://developers.cloudflare.com/r2/platform/limits/)。

### G. 搜索与过滤

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 当前目录内即时过滤（纯客户端，零 API 成本） | P0 | 低 | |
| 前缀搜索（服务端 prefix） | P0 | 低 | |
| 递归深搜（带条数上限 + **执行前告知预计 Class A 次数** + 可随时取消） | P1 | 中 | Cloudflare 自己拒绝在 Wrangler 加 glob list，理由正是"慢且容易烧账单" |
| 按类型 / 大小 / 时间过滤（基于已加载或已缓存数据，明确标注范围） | P1 | 低 | |
| 本地 SQLite 对象索引（支持离线全量搜索 + 增量刷新） | P2 | 高 | 有了它才能真正做到"像本地一样搜" |

### H. 同步 / 镜像

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 本地目录 → bucket 单向同步（size + mtime/ETag 判定，跳过未变） | P1 | 高 | |
| bucket → 本地单向同步 | P1 | 高 | |
| 目录对比视图（仅本地 / 仅远端 / 有差异 / 相同） | P1 | 中 | ForkLift 的 Sync & Compare |
| 试运行（dry-run）预览将要发生的变更 | P1 | 低 | 与同步同批实现，成本极低，安全收益极大 |
| bucket ↔ bucket 镜像（服务端 copy） | P2 | 高 | |
| 排除规则（glob / `.gitignore` 风格） | P2 | 中 | |
| 定时 / 文件监听自动同步 | P2 | 高 | |

### I. 用户体验

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 快捷键（导航、多选、删除、重命名、复制路径） | P0 | 低 | |
| 深/浅色主题（跟随系统） | P0 | 低 | |
| 从系统文件管理器拖入上传 | P0 | 中 | |
| 首启引导（教用户建 R2 API Token）+ 有用的空状态 | P1 | 低 | 所有竞品的最大流失点都在这一步 |
| 命令面板（Cmd+K：跳 bucket / 跳前缀 / 执行动作） | P1 | 中 | |
| i18n（zh-CN + en 起步） | P1 | 低 | |
| 自动更新 | P1 | 低 | tauri-plugin-updater |
| 拖出到系统文件管理器即下载 | P2 | 高 | Tauri 里较麻烦，先用"下载到…"替代 |
| 多标签页 / 多窗口 | P2 | 中 | |
| 菜单栏快捷上传 + 上传完自动复制 URL | P2 | 中 | R2Drop 的核心心流，很讨喜 |
| 系统右键菜单集成（Finder / 资源管理器） | P2 | 高 | |

### J. 可观测性（含成本）

| 功能 | 优先级 | 复杂度 | 备注 |
| --- | --- | --- | --- |
| 结构化操作日志（时间 / 动作 / key / 耗时 / 结果 / 请求 ID） | P0 | 低 | Cyberduck 用户抱怨最多的就是"出问题时它太安静" |
| 错误人话化映射（`SignatureDoesNotMatch` / `AccessDenied` / `NoSuchBucket` / 412 / 429 / `InvalidPart` → 该怎么修） | P0 | 中 | |
| 重试与指数退避（429 / 5xx；同 key 1 写/秒） | P0 | 中 | |
| **Class A / Class B 计数器 + 免费额度进度条**（本应用产生的操作实时累计） | P1 | 中 | 免费额度：1M Class A + 10M Class B + 10 GB/月 |
| **操作前成本预估**（递归列举、深搜、批量 copy 前报"预计 N 次 Class A ≈ $X"） | P1 | 中 | 单价：Class A $4.50/百万、Class B $0.36/百万（IA 翻倍：$9.00 / $0.90）；**用量按百万向上取整** |
| 未完成 multipart 占用提醒（列出 + 一键 abort + 建议加 lifecycle 规则） | P1 | 低 | 桶默认已有"7 天后过期 MPU"规则，但期间照样计费 |
| bucket 指标图表（`r2OperationsAdaptiveGroups` / `r2StorageAdaptiveGroups`） | P2 | 中 | 与 Dashboard 同源数据；注意官方声明 GraphQL 数据不等于账单口径 |
| 可选的匿名崩溃上报（默认关闭） | P2 | 低 | |

计费与指标依据：[R2 Pricing](https://developers.cloudflare.com/r2/pricing/)、[Metrics and analytics](https://developers.cloudflare.com/r2/platform/metrics-analytics/)、[Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)、[R2 计价器](https://r2-calculator.cloudflare.com/)。

---

## 任务三：差异化机会（按价值排序）

### 1. 能干活的传输引擎：大文件 + 文件夹 + 断点 + 队列

**空位有多大**：Dashboard 单文件卡在 ~300 MiB、不支持保留层级的文件夹上传、无队列、失败即重来；Wrangler 一次只能传一个对象且 315 MB 上限；Transmit 因为 chunked 传输**完全无法支持 R2**；R2-Explorer 的"批量删除"和"文件夹下载"issue 从 2024 年 1 月挂到今天。R2 本身支持 5 TiB 对象 / 10000 分片 / 完全可恢复的 multipart——**能力一直都在，只是没有好客户端去用**。

**要做的**：客户端 multipart（等长分片）+ 分片状态持久化 + 重启后复用 upload id 续传 + 可暂停可重排的队列 + 全局与单任务两级并发。这是 P0，也是整个产品的立身之本。

### 2. 完整的对象整理操作：重命名 / 移动 / 批量

**空位有多大**：Dashboard 从 2024 年到现在都没有 rename 和 move，社区问了两年，标准答案一直是"用 rclone"。而实现路径很清楚：`CopyObject` + `DeleteObjects`（每批 1000），大对象用 `UploadPartCopy`。R2-Manager-Worker 已经验证了"批 100 + 300ms 延迟"的节流参数可行。

**要做的**：文件夹级（前缀级）的 rename / move / copy，全程可见进度、可取消、失败可续、跳过已完成。加上"批量改 Content-Type / Cache-Control"——这是运维静态资源桶的日常，目前没有任何 GUI 提供。

### 3. 把 R2 专属控制面收进桌面（通用 S3 客户端结构性做不到）

**为什么是结构性的**：生命周期、CORS、自定义域、`r2.dev` 公开开关、事件通知、bucket lock、jurisdiction、存储类转换、Sippy / Super Slurper、用量指标——**这些全部只存在于 Cloudflare 自己的 REST API 上，S3 API 里没有**。所以 Cyberduck、ForkLift、Commander One、S3 Browser、brows3 无论怎么打磨都碰不到。Binnacle 已经在往这个方向走（D1 + R2 + KV 一体化），说明这是被识别出的方向，但它是 Rust/GPUI、macOS-only、17★，位置还空着。

**要做的**：同时说 S3 API（数据面）和 Cloudflare REST API（控制面），两套凭据在 UI 上讲清楚。这是"R2 专用客户端"相对"S3 通用客户端"唯一无法被追平的护城河。

### 4. 成本可见性：把 Class A/B 摆在用户眼前

**为什么值钱**：Cloudflare 官方亲口确认"你打开 bucket 页面浏览就在产生计费操作"。R2 按百万向上取整，跨过 1,000,000 就买下整个下一个百万。免费额度只有 1M Class A / 10M Class B。而"递归深搜"和"全量列举"这类动作，Cloudflare 自己都以"容易烧账单"为理由拒绝加进 Wrangler。

**目前全行业没有任何一个 S3/R2 GUI 做这件事。** 这是差异化性价比最高的一项：

- 会话内 Class A / B 实时计数 + 免费额度进度条
- 高成本动作执行前报价："这次深搜预计 ~1,800 次 Class A（本月剩余额度 62%）"
- 主动提示未完成 multipart 正在计费，一键 abort + 一键加 lifecycle 规则
- 生命周期"转 IA"时说明会产生一次 Class A

对一个"因为省钱才从 S3 搬到 R2"的用户群来说，这是最能建立信任的功能。

### 5. 凭据与分享的安全模型

**空位在哪**：Cyberduck 的 R2 文档到今天还写着"不支持 pre-signed URLs"，而 R2 从 2022-06-17 就支持了——通用客户端对 R2 的认知严重滞后。Dashboard 也没法给单个对象一键生成限时分享链接。桌面竞品里凭据存储多半只是"存在本地文件"。

**要做的**：凭据进 OS keychain（不落配置文件、不进渲染进程）；presigned GET/PUT 生成器（有效期可调，并明确提示不能配自定义域）；可选的 temporary credentials 生成器（按前缀和动作限权，用于把有限访问交给同事或 CI）。

---

## 附：实现红线速查（踩过的坑，别再踩）

| 约束 | 后果 / 来源 |
| --- | --- |
| 不要用 `Transfer-Encoding: chunked` | R2 不支持流式传输，这就是 Transmit 支持不了 R2 的原因 |
| multipart 除最后一片外必须**等长** | 否则 `InvalidPart`；[distribution#3873](https://github.com/distribution/distribution/issues/3873) |
| region 只能是 `auto`（空值 / `us-east-1` 会别名过去） | 写死其他区域会被拒；Cyberduck 的经典故障 |
| jurisdiction 桶必须用对应端点，且区域参与签名 | `<acct>.eu.r2.cloudflarestorage.com` |
| `ListObjectsV2` 每次最多 1000，只有 prefix / delimiter / start-after | 无 glob、不能按时间或大小排序 |
| CopyObject 单次上限 5 GiB | 更大的对象要 UploadPartCopy 分片 |
| 同一 key 写入 1 次/秒，超出返回 429 | 批量重命名时要按 key 打散 |
| presigned URL 不支持 POST、不能配自定义域 | |
| Cloudflare REST API 限 1200 请求 / 5 分钟 | 配置操作走它，数据操作走 S3 API |
| 未完成的 multipart 分片会计费（默认 7 天后自动过期） | 需要主动列出与清理 |
| 对象标签、版本控制、ACL、bucket policy、SSE-KMS 一律未实现 | 别在 UI 里承诺 |

---

## 建议的 MVP 边界（v0.1）

只做 P0，且刻意砍掉同步：

连接与多账号（keychain）→ 目录浏览（虚拟化 + 分页 + 详情）→ 上传（文件 + 文件夹 + multipart + 断点 + 队列）→ 下载（文件 + 文件夹）→ 删除 / 重命名 / 移动 / 复制（含前缀级批量）→ 预览 + presigned 分享链接 → bucket 列表与创建/删除 → 操作日志与错误人话化。

这一套就已经**严格超过 Dashboard、且超过所有现存 R2 专用开源桌面客户端**。同步、成本面板、Cloudflare 控制面（CORS / 生命周期 / 自定义域）留到 v0.2，其中成本面板是最强的市场差异点，建议紧随其后。
