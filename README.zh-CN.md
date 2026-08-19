# r2nova

[Cloudflare R2](https://developers.cloudflare.com/r2/) 专用桌面客户端。不是又一个通用 S3 浏览器：成本可见性、真正的传输引擎、对象整理（重命名/移动/复制），以及只存在于 Cloudflare REST 上的控制面。

[English](./README.md)

## 为什么做

Dashboard 单文件上限 300 MiB，无队列、无断点续传、文件夹上传不保留层级。Cyberduck / ForkLift / S3 Browser 碰不到生命周期、CORS、自定义域、`r2.dev`、事件通知、bucket lock、用量。Transmit 无法完整支持 R2（只发 `Transfer-Encoding: chunked`）。

全部网络与加密在 Rust（Tauri 2），Access Key 永不进入 WebView。

## 功能

- 多账号，系统钥匙串；Admin / Object 级 Token 探测
- `ListObjectsV2` 懒加载、虚拟化表格、反向集合多选
- 等长分片上传（R2 禁止变长）、断点续传、保留层级的文件夹上传、拖入
- 重命名 / 移动 / 跨桶复制（大文件 `UploadPartCopy`）
- 图片 / 视频 / 文本 / Markdown / PDF 预览，预签名 GET
- CORS、生命周期、`r2.dev`、自定义域、bucket lock、事件通知、用量
- 会话内 Class A/B 计数与高成本列举报价

**不做**（平台不支持）：对象版本、标签、ACL、bucket policy、SSE-KMS/SSE-S3。

## 安装

macOS（v1 未签名 DMG，Homebrew Cask）：

```bash
brew tap jt302/r2nova
brew install --cask r2nova
```

Windows：GitHub Releases 的 NSIS 安装包。

## 开发

```bash
pnpm install
pnpm tauri dev
```

需要 Node 24.14.1、Rust 1.94.1、pnpm 10。macOS 13+ / Windows 10+（WebView2）。

改 S3 代码前先读 [AGENTS.md](./AGENTS.md) 和 [docs/r2-constraints.md](./docs/r2-constraints.md)。

## 许可证

MIT
