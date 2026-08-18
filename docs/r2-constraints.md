# R2 硬约束速查

改 S3 / 传输 / 计费代码前读这一页。违反项多数在运行时才暴露，且常伴随账单。

## 分片与对象大小

| 约束 | 值 | 违反后果 |
| --- | --- | --- |
| 非末尾分片必须等长 | 全部相同 | `InvalidPart`（10048） |
| 最小分片 | 5 MiB（末片除外） | `EntityTooSmall` |
| 最多分片 | 10_000 | `EntityTooLarge` / 无法 Complete |
| 单次 PUT | 5 GiB | 更大必须 multipart |
| CopyObject | 5 GiB | 更大走 `UploadPartCopy` |
| 推荐算法 | `chunk = max(8MiB, ceil(size/10000)).round_up_to_mib()` | 同时满足最小、最多、等长 |

`UploadPart` 重传会**替换**该分片；重传失败则原分片丢失。断点续传状态机必须按 part number 重传，不能假设旧 ETag 仍有效。

实现：[`src-tauri/src/s3/multipart.rs`](../src-tauri/src/s3/multipart.rs)。

## 端点与签名

| 项 | R2 行为 |
| --- | --- |
| region | 只能 `auto` |
| 默认端点 | `{accountId}.r2.cloudflarestorage.com` |
| EU 管辖区 | `{accountId}.eu.r2.cloudflarestorage.com` |
| FedRAMP | `{accountId}.fedramp.r2.cloudflarestorage.com` |
| 同 key 写入 | 约每秒 1 次；更密会隐式覆盖/失败 |
| Transfer-Encoding: chunked | **不支持**（这是 Transmit 不完整支持 R2 的原因） |
| Java SDK | 必须关 chunked encoding |

每个管辖区一个独立 S3 客户端实例，不要混用。

## ListBuckets 超千桶

R2 **未实现** AWS ListBuckets 的 `max-buckets` / `continuation-token` 查询参数。带上会 501 `NotImplemented`（`ListBuckets search parameter max-buckets not implemented`）。

超过约 1000 个桶时，R2 在响应头带：

- `cf-list-bucket-truncated`
- `cf-list-bucket-cursor`

当前实现只取第一页。不要假设一次 `ListBuckets` 能拿完全部桶。

## Token 能力

R2 API Token 两档：

| 探测 | 含义 | UI |
| --- | --- | --- |
| `ListBuckets` 成功 + `GET /r2/buckets` 成功 | Admin | 全功能 |
| `ListBuckets` 成功 + REST 401/403 | Object 级 | **灰掉全部桶管理**，不是降级 |
| 两者都失败 | 凭据无效 | 引导重配 |

Object 级 Token 打 `api.cloudflare.com` 是彻底不可用，不是缺某一个权限。401 请求不计费。

## 计费（Class A / B）

免费额度：1M Class A / 10M Class B / 月。超出按百万次**向上取整**。

| Class A（$4.50 / 百万） | Class B（$0.36 / 百万） | 免费 |
| --- | --- | --- |
| ListBuckets, ListObjectsV2, Put, Copy, 所有 multipart 控制/分片, CreateBucket | Head*, GetObject, GetBucket* | Delete*, AbortMultipart |

**浏览文件夹比下载文件贵 12.5 倍。** 不要自动轮询 `ListObjectsV2`。高成本操作执行前报价。未完成 multipart 会持续产生存储费用，控制面要能列举并 abort。

Cloudflare REST：全账号 **1200 次 / 5 分钟**。只做低频管理，且 GET 必须缓存。

## Checksum

2025-02 起 R2 已兼容 flexible checksums，**不要默认关掉** SDK checksum。实测失败再降为 `WHEN_REQUIRED`。

类型矩阵与 AWS 几乎相反：

- CRC32 只支持 COMPOSITE
- 唯一支持 FULL_OBJECT 的是 CRC64NVME

## 预览与分享

- 预签名 GET：1 秒–7 天；**不支持 POST**；**不能**绑自定义域名
- `r2.dev` 公开 URL 与预签名是两条路
- 预览：Rust 下到 `$APPCACHE`，`asset://` 交给 `<img>`/`<video>`/`<iframe>`（PDF）

## 错误码 → 用户提示

| S3 / R2 code | `AppError.kind` | 用户侧 |
| --- | --- | --- |
| Unauthorized, InvalidAccessKeyId, ExpiredToken | `invalidCredentials` | 凭据无效，重新配置 |
| AccessDenied, SignatureDoesNotMatch, NotEntitled | `accessDenied` | 权限不足 |
| NoSuchKey, NoSuchBucket, NotFound | `notFound` | 对象或桶不存在 |
| BucketNotEmpty, BucketAlreadyExists, BucketConflict | `conflict` | 桶非空或名称冲突 |
| TooManyRequests, SlowDown | `rateLimited` | 降速重试 |
| InvalidPart, EntityTooSmall, EntityTooLarge | `r2Constraint` | 分片/大小违反 R2 约束 |
| ObjectLockedByBucketPolicy | `objectLocked` | Bucket lock 挡住了写入/删除 |

实现：[`src-tauri/src/error.rs`](../src-tauri/src/error.rs) 的 `from_s3_code`。前端按 `kind` 分支，不要解析 `message`。

## 不要做（平台不支持）

对象版本控制、对象标签、ACL、bucket policy、SSE-KMS / SSE-S3、预签名 POST、用自定义域名签 URL。

UI 上不要放这些入口，避免用户以为 Dashboard 漏了开关。
