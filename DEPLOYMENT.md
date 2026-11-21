# 部署说明（Cloudflare Pages）

本仓库是 `public/` 静态页面 + `functions/` Pages Functions + `SPOOFER_DATA` KV，
不是 Node HTTP 服务。运行时依赖 Cloudflare 的 `ASSETS`、`HTMLRewriter`、KV 和 Web APIs。
无前端编译步骤、无 npm 运行依赖、无现有 Docker 或 Compose 配置。
单独用 Nginx/静态托管无法提供鉴权、坐标保存或动态模块链接。
本次提供原生 Pages 部署文件；服务器 Docker 部署需要另写运行时与持久化适配。

## 推荐：Git 集成部署

1. 在 Cloudflare 创建两个 KV 命名空间：`SPOOFER_DATA`（生产）和 `SPOOFER_DATA_PREVIEW`（测试）。
2. Workers & Pages 中创建 **Pages** 项目，连接 `MasonMeihh/iOS-Location-Spoofer-Web`。
   生产分支 `main`，框架 None，构建命令 `exit 0`，输出目录 `public`。
3. 在项目设置中分别配置 Production / Preview：
   - KV 绑定变量名必须为 `SPOOFER_DATA`，分别选择生产 / 测试命名空间。
   - 添加秘密变量 `TOKEN`（两个环境使用不同的随机值，必填）。
   - 可选 `AMAP_KEY`（高德 Web 服务 Key）；该 Key 会注入浏览器，不能当成服务端秘密。
4. 重新部署让绑定和变量生效。PR 分支只做 Preview；审核合并后才更新生产。
5. 打开 HTTPS 的 Pages 地址，输入 Token 登录，按下文验收。

仓库中的 `wrangler.json.example` 不会自动覆盖 Dashboard 配置，适合已有 Pages 项目安全采用。
不要直接把示例中的 KV 占位值用于部署。

## 可选：Wrangler 命令行部署

安装 Node.js 22 LTS（带 npm），在仓库根目录执行。以下命令适用于 PowerShell 和常见终端：

```sh
npx wrangler@4.165.0 login
npx wrangler@4.165.0 kv namespace create SPOOFER_DATA
npx wrangler@4.165.0 kv namespace create SPOOFER_DATA_PREVIEW
```

复制 `wrangler.json.example` 为 `wrangler.json`，修改项目 `name`，把两次输出的 ID
分别填入顶层与 `env.preview` 的 KV 配置。已有项目应先运行
`npx wrangler@4.165.0 pages download config 项目名` 下载配置并对照，避免覆盖现有绑定。
配置文件启用后，绑定以该文件为准，生产与 Preview 必须分别核对。

新建直接上传项目（已有同名项目跳过）并设置生产秘密：

```sh
npx wrangler@4.165.0 pages project create ios-location-spoofer-web --production-branch main
npx wrangler@4.165.0 pages secret put TOKEN --project-name ios-location-spoofer-web
npx wrangler@4.165.0 pages secret put AMAP_KEY --project-name ios-location-spoofer-web
npx wrangler@4.165.0 pages deploy public --project-name ios-location-spoofer-web --branch main
```

`TOKEN` 按提示输入，不要写入配置或提交仓库。未使用高德时跳过 AMAP_KEY。
若改了项目名，所有命令同步替换。此处 `--branch main` **会更新线上生产环境**；
仅在审核通过、准备发布时执行。预览部署改用 `--branch deployment-preview`，
并事先在 Dashboard 为 Preview 设置独立 TOKEN。
直接上传项目与 Git 集成项目的接入方式不同，按需选一种，不要重复创建。

## 本地运行

复制 `.env.example` 为 `.dev.vars`，设置随机 TOKEN。使用 64 位十六进制值，
避免模块 URL 中的特殊字符。生产 TOKEN 不从此文件自动上传。

```sh
npx wrangler@4.165.0 pages dev public --kv SPOOFER_DATA --port 8788
```

无需复制 Wrangler 配置即可本地使用模拟 KV；已有配置也可运行此命令。
访问 `http://localhost:8788/`。本地 KV 写入 `.wrangler/`，不是线上数据库；
不要使用 `--remote` 测试生产数据。本地 HTTP 只用于开发，手机正式使用应部署 HTTPS。

## 验证与验收

先检查 Functions 可以打包（不上传）：

```sh
npx wrangler@4.165.0 pages functions build --outdir .wrangler/build
node --test tests/deployment.test.mjs
```

然后在本地或独立 Preview 上验收：

- 未带 Token 请求 `/verify`、`/loc.json` 应为 401；正确 Token 请求 `/verify?token=...` 为 200。
- 页面能登录，设置坐标后刷新仍保留；新建收藏、刷新、删除均正常。
- `/ios-location-spoofer.sgmodule?token=...` 返回文本，
  `script-path` 与 `configUrl` 为当前 HTTPS 域名，无“你的域名/你的Token”占位符。
- `/location-spoofer.js`、`/manifest.json` 和图标可访问。
- 浏览器源码的 `window.__CFG__` 包含 hasToken 和 amapKey，不含 TOKEN 明文。

测试代码使用内存 KV 验证接口逻辑；实际 KV 绑定、HTMLRewriter 和边缘路由仍需以上运行时验收。
Cloudflare KV 是最终一致存储，跨地区读取可能延迟，并发更新收藏可能相互覆盖；沿用项目单用户定位。

## 排障与维护

- 未设置 TOKEN：原代码会允许匿名访问，部署前务必设置并重新部署。
- 保存后数据消失：检查 `SPOOFER_DATA` 名称和环境；未绑定 KV 时原接口也可能返回成功。
- 地图不显示：检查 unpkg、地图瓦片、字体等外部服务连通性；未配 AMAP_KEY 使用备用搜索。
- PWA/浏览器定位需 HTTPS；页面正常并不代表设备端 MITM 已生效，继续按 README 配置 Shadowrocket。
- 回滚：在 Pages Deployments 中选择上一个生产部署回滚；KV 数据不随代码回滚。
  切换部署前通过 Cloudflare KV 工具备份 `loc` 与 `favorites`；不要公开导出的私人数据。
- 本改动不创建云资源、不修改生产秘密，也不自动上线。

参考：[Pages 配置](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)、
[Pages 命令](https://developers.cloudflare.com/workers/wrangler/commands/pages/)。

