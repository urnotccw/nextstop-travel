# 不能下载 ZIP 时，使用这份导入说明

这已经是可运行的纯前端源码。请读取文件本身，不要根据本文另画一个近似页面。

## 最推荐：按清单逐文件获取

[FILES.json 原始文本](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/FILES.json)

1. 读取上述 JSON，遍历 `files`。
2. 用每一项 `url` 获取文件原始内容，按 `path` 保存到你的作品目录。图片和字体以二进制保存，不要当作文本转换。
3. 保留完整路径结构；每一项还带有 `bytes` 和 `sha256`，可校验文件完整性。
4. 运行根目录 `index.html`，不需要安装、构建、业务服务器或数据库。
5. 若平台的读取工具只能返回截断后的文本，不能将其当作完整源码保存；请使用能完整保存响应的文件获取能力，或明确报告这一限制。

不涉及 ZIP，也不要求 Git。清单只包含运行所需的纯前端文件，不包含旧项目的后端与 Git 元数据。

## 若只能读一个 HTML 文件

[可编辑单文件 HTML 原始内容](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/editable-single-file.html)

这个版本将原始样式、脚本与地图数据内嵌在 HTML 中，每段都有 `data-source` 标明原文件名。直接保存为 `index.html` 即可预览，约 1–2 MB。

注意：此版本的图片与字体从公开 GitHub 静态资源读取，需要联网。这不是后端接口。如作品平台禁止外链资源，请根据 FILES.json 下载对应素材，并把 HTML 内的资源前缀 `https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/assets/` 改回 `assets/`。

这里采用较小的单文件，避免内嵌全部图片后超过平台的附件或读取限制。需要完全本地运行时，使用第一种逐文件获取方式即可。

## 导入后要保留什么

- 用现有中国地图数据和渲染逻辑，不重画简化轮廓。
- 用原版安安 PNG、城市照片、字体与图标，不替换为 emoji 或文字头像。
- 保留奶油色、登机牌、贴纸照片、行程时间线和现有交互。
- 只做桌面纯前端，保留本地演示标识，不增加后端或在线生成服务。
- 查看 [START-HERE.md](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/START-HERE.md) 中的具体修改要求。

视觉参照：[首页](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/reference/home.png)、[行程](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/reference/itinerary.png)、[房间](https://raw.githubusercontent.com/urnotccw/nextstop-travel/refs/heads/frontend-redcowork/reference/room.png)。

如果连 HTTP 文件读取和 HTML 附件也不支持，请明确说明能力限制；更换链接本身无法解除平台限制。不要在未读取源码时声称已按源码还原。
