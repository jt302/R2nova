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

## 添加账号

第一次打开会要填一堆字段。对照如下，截图是中文控制台（2026-08）。官方说明：[R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/)。

| r2nova 字段 | 从哪来 | 必填 |
| --- | --- | --- |
| 名称 | 自己起，只在本地显示 | 是 |
| Account ID | R2 概述右侧「帐户详情」 | 是 |
| Access Key ID / Secret Access Key | R2 的 API 令牌（S3 那套） | 是 |
| Cloudflare API Token | 个人资料 → API 令牌 | 否。要配 CORS、生命周期、自定义域才需要 |
| 管辖区 | 建桶时选了 EU / FedRAMP 才改 | 一般保持「默认」 |

S3 API 那个 endpoint 不用填，r2nova 会自己拼。

### 1. 打开 R2

登录 [Cloudflare 控制台](https://dash.cloudflare.com/) → **存储和数据库** → **R2 对象存储**。

![侧栏进入 R2](docs/images/add-account/01-nav-r2.png)

### 2. 复制 Account ID

右侧 **帐户详情** 里复制 **帐户 ID**（32 位十六进制，不是登录邮箱）。然后点 **管理 API 令牌**。

![帐户详情](docs/images/add-account/02-account-id.png)

### 3. 创建 R2 API 令牌（Access Key）

个人用点 **创建 User API 令牌**。给生产系统、希望人走了令牌还在，用 Account API 令牌（需要超级管理员）。

![创建 R2 API 令牌](docs/images/add-account/03-r2-api-tokens.png)

权限选 **对象读和写**（页面默认经常是「对象只读」，那个传不了文件）。桶选全部，TTL 选永久即可。

![R2 令牌权限](docs/images/add-account/04-r2-token-permissions.png)

创建后会给出 **Access Key ID** 和 **Secret Access Key**。Secret 只显示一次，立刻复制。

这一步拿到的是 S3 凭据，只能浏览/传对象。CORS、生命周期、自定义域、`r2.dev` 还要下一步的 Token。

### 4. （可选）Cloudflare API Token

[个人资料 → API 令牌](https://dash.cloudflare.com/profile/api-tokens) → **创建令牌** → **自定义令牌** → **开始使用**。

权限选：**帐户** → **Workers R2 Storage** → **编辑**。帐户资源保持「包括 / 所有帐户」。

![自定义 API 令牌](docs/images/add-account/05-cf-custom-token.png)

### 5. 填进 r2nova

打开 r2nova → **添加账号**，把上面三样（可选四样）贴进去保存。

![r2nova 添加账号](docs/images/add-account/06-r2nova-form.png)

保存后会探测权限：能列出桶就是 Object 级；再加上 Cloudflare API Token 探测成功才是 Admin，控制面按钮才会亮。

## 开发

```bash
pnpm install
pnpm tauri dev
```

需要 Node 24.14.1、Rust 1.94.1、pnpm 10。macOS 13+ / Windows 10+（WebView2）。

改 S3 代码前先读 [AGENTS.md](./AGENTS.md) 和 [docs/r2-constraints.md](./docs/r2-constraints.md)。

## 许可证

MIT
