# 收录与修改插件

1. 先在自己的仓库发布完整可安装插件。推荐使用 Varin extension CLI 的 `release` 命令，将 `.tgz` 与 `varin.release.json` 上传到自己的 GitHub Release；也可发布完整预构建 npm 包。
2. 复制 `examples/dev.example.weather.json` 到 `entries/<manifest-id>.json`，填写与包内 `varin.extension.json` 一致的 ID，并提供名称、简介、作者、用途、关键词、仓库和发行来源。
3. 把图标放在 `assets/`，填写该仓库内的相对路径。SVG 不得包含脚本、外部资源或嵌入页面。列表不从作者网站临时抓图。
4. 运行 `npm run build` 更新目录，提交 PR。CI 自动检查资料、图标、构建以及本次新增或修改条目的真实发行包；维护者审阅插件用途、维护归属和实际发行材料。

不要求作者为投稿增加测试工程、运行 Varin 全仓库测试或交付无关报告。维护者应在无部署凭据的环境中下载、核对发行清单、包摘要、实际 manifest 身份和入口；不得运行投稿安装脚本或插件入口。发行资料缺失或网络检查失败时在 PR 说明真实原因，不自动删掉既有收录。

## 发行来源

GitHub 示例：

```json
{"kind":"github-release","specifier":"owner/repository","display":"owner/repository"}
```

稳定渠道使用正式 Release。预发行使用 `owner/repository#prerelease`。单仓多插件可设置 `owner/repository#stable?tagPrefix=weather-v&manifest=weather.release.json`，对应 `weather-v1.2.3` tag 与具名发行清单。默认 tag 前缀是 `v`，默认清单是 `varin.release.json`。

npm 示例：

```json
{"kind":"npm","specifier":"@author/weather@latest","display":"@author/weather"}
```

包必须包含完整预构建运行材料，安装不执行生命周期脚本。目录不包含令牌、用户名密码、最新版本、逐版本下载地址或更新日志。

## 哪些变化需要 PR

- 新版本、发行包、README 或作者文档内容变化：不需要，直接在作者项目发布。
- 列表名称、简介、图标、作者、分类或关键词变化：修改收录资料并重新构建。
- 仓库、维护归属或发行来源变化：在 PR 中明确说明。已安装插件继续使用原保存来源，不会因目录变更被静默接管。
- 下架：删除条目并重新构建。下架只影响发现，不卸载用户已装的代码。

同一目录内 ID 唯一。不同第三方目录出现相同 ID 时，由 Varin 按 ID 与发行来源区分。详细说明仍链接作者仓库，市场不镜像 README。
