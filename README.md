# Varin 插件市场

这里维护 Varin 插件的公开收录资料、静态图标、市场网站和机器可读目录。插件源码和版本发行留在作者仓库。

当前目录为空。示例放在 `examples/`，不是已收录或已验证的真实插件。市场收录不构成代码审计、权限授权或安装白名单。

## 本地开发

需要 Node.js 22.19 或更高版本。目录来源校验使用 semver；发行核验另外使用 tar，不执行投稿插件代码。

```sh
npm ci --ignore-scripts
npm test
npm run build
python3 -m http.server 8080 --directory dist
```

构建生成 `dist/` 和已提交的 `catalog/v1.json`。网页、目录和图标来自同一份资料。目录 `contentVersion` 覆盖展示资料与图标内容；协议入口为 `/catalog/v1.json`。Varin 初始默认读取 GitHub raw 上同一文件，因此不依赖尚未确认的站点域名。

作者发版不需要修改本仓库，也不会触发站点重建。应用只在安装预览、安装或检查已安装插件更新时访问作者发行来源。市场浏览只读取静态目录和资源。

## Cloudflare Pages

项目尚未部署。由有权维护该仓库与 Cloudflare 的管理员建立 Pages Git 集成：仓库 `Astrmira/Varin-plugins`，生产分支 `main`，构建命令 `npm run build`，输出目录 `dist`，Node.js 24。域名 `plugins.varin.dev` 只是设计建议，需确认所有权和 DNS 后再绑定。

Git 集成负责 main 合并后的发布；CI 只做校验、测试和静态构建，不使用生产部署令牌，不采用 `pull_request_target` 执行投稿内容。外部 fork PR 不承诺 Pages 预览，构建产物仍可供审阅。

目录与静态资源一起发布，`site/_headers` 配置缓存验证与内容安全策略。这里没有动态数据库、中心版本 API、定期抓取作者 Release 或投稿账号系统。

提交和修改方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 投稿发行核验

`npm run check:releases` 检查当前条目的真实作者发行；设置 `CATALOG_BASE_SHA` 为基线提交 SHA 时，只检查该基线以来新增或修改的 `entries/*.json`。CI 使用 PR 基线或 push 前提交，不轮询未修改条目。核验下载所有声明目标的清单与归档，检查摘要、包内身份、版本、兼容范围及已构建入口，拒绝链接、路径越界和特殊设备文件；归档只读检查，不解压或运行插件代码。网络失败或交付不完整会使检查失败，不修改既有目录。公共来源下载仅接受 GitHub/npm HTTPS 地址及其已知下载域名，重定向同样检查。

## 许可

本仓库代码按 [AGPL-3.0-only](LICENSE) 发布，与 Varin 主仓库一致。投稿图标与资料的作者须具备相应使用和分发权。
