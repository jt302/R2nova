# D2 — 上传分片必须等长

- 状态：已采纳
- 日期：2026-08-18

## 决策

分片大小固定为：

```text
chunk = max(8 MiB, ceil(size / 10000)).round_up_to_mib()
```

所有非末尾分片等长。实现与单测在 `src-tauri/src/s3/multipart.rs`。

## 理由

S3 允许变长分片，R2 不允许，否则 `InvalidPart`（10048）。[distribution#3873](https://github.com/distribution/distribution/issues/3873) 是真实踩坑。

该公式同时满足最小 5 MiB、最多 10000 片、等长三个约束。
