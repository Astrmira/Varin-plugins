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

### 网页交互验证

网页保持零运行时框架依赖，仅从 `/catalog/v1.json` 读取已收录条目。支持名称、ID、关键词、用途、作者和来源搜索，来源/用途筛选，名称/作者排序，分享筛选 URL，以及深色、浅色与系统主题。界面按提供的设计稿重构为紧凑首屏、等距网格与真实 CSS 3D 品牌立方体、三列插件卡片和字段联动的 JSON 检视器。详情中的安装链接沿用 Varin 的 `varin://extensions/install` 协议，打开链接不等于批准安装。

```sh
npx playwright install --with-deps chromium
npm run test:site
```

浏览器回归包含 16 组场景，覆盖真实空目录、仅测试用条目、设计关键尺寸、筛选与历史导航、详情焦点/关闭、字段高亮与键盘标签页、复制成功/失败、命令生成器、错误重试、320–1080 px 响应式布局和主题。可设置 `CHROMIUM_PATH` 使用已有 Chromium，设置 `SCREENSHOT_DIR` 保存本次测试截图；测试数据通过浏览器路由注入，不写入或发布到目录。现有 CI 继续执行目录与发行校验；浏览器回归可单独运行，不改变站点部署流程。本轮受运行环境限制，尚未完成 Chromium 实测或截图验收；详细状态见 [网页设计与验证说明](docs/web-design.md)。

开发者区提供与实际 CLI 对齐的 7 种模板命令生成器，需要先安装 `@varin/extension-cli`。生成的是 POSIX shell 命令文本，包含必填 ID/名称、安全引号与失败即停止的 `&&` 链，不会由网页执行。

“收录资料预检”只在浏览器内检查 JSON 基础结构，不上传输入，不宣称验证发行、SemVer 范围、图标文件、完整扩展契约或代码安全。最终校验仍是 `npm run validate` 与 `npm run check:releases`。

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
