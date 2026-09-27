# 下一站 · 飞镖旅行

公开访问：[打开旅行网站](https://urnotccw.github.io/nextstop-travel/)。这个 GitHub Pages 链接会跳转到完整运行站，以便地图、行程生成和多人房间共用同一个服务端与数据库。GitHub 仓库保留前端、服务端源码和[界面原型](https://urnotccw.github.io/nextstop-travel/prototype.html)。GitHub Pages 本身只托管静态文件，不能运行房间数据库和行程接口。

手机（iPhone 15 Pro / 393 × 852，兼容 320px 以上）与桌面双布局，可在顶部切换。

## 体验路径
地图缩放、搜索或填写城市 → 加入候选池比较 → 设置天数、预算、交通时段、节奏和偏好 → DeepSeek 生成详细行程 → 保留喜欢的站点、AI 换一站或手动编辑 → 保存 / 分享。

所有城市使用同一个服务端 AI 接口。旧版示例行程仍保留并明确标记，可以重新用 AI 生成。重新生成不会删除保留站点，失败不覆盖旧草稿，成功后可撤销。换站先预览再应用。生成支持取消等待；重试保留输入。

## DeepSeek 配置
在 https://platform.deepseek.com/api_keys 创建密钥，并确保账户有可用额度。密钥仅用于服务器，不得写入 public、源码或分享链接。

本地：复制 .env.example 为 .env，填写 DEEPSEEK_API_KEY；运行 npm start。
生产：通过 Sites 环境变量配置 DEEPSEEK_API_KEY，is_secret=true，然后重新部署已保存版本。可选 DEEPSEEK_MODEL，默认 deepseek-flash，依据 2026-09-21 官方文档。修改环境变量后必须重新部署才生效。

未配置密钥时，返回 AI_NOT_CONFIGURED，不调用模板冒充模型结果。/api/ai/status 仅返回是否配置，不返回密钥，也不代表已经成功调用。接入配置不等于真实模型验收；必须用真实密钥完成生成后才算端到端验证。

## 开发与发布
原生 HTML/CSS/JS 位于 public/；Cloudflare Worker 位于 server/worker.mjs。没有运行时 npm 依赖。npm run build 生成 dist/client、dist/server/index.js 和 Sites 元数据。npm test 验证服务端安全边界、第三方错误、结构与时间检查、保留站点和并发拦截。
本地服务仅监听 127.0.0.1:4173，使用本地预览身份。生产使用 Sites 可信身份头，并检查同源请求、请求大小和输入格式。短期请求节流为单 isolate 防连点，不是全局费用上限。取消等待尽力中止上游连接，不能保证供应商不计费。

## 边界
- 个人草稿和个人候选保存在当前浏览器；旅行房间的成员、共同候选、投票、已发布行程和各自确认存入 D1。房间每 3 秒轮询同步，后台标签页暂停。个人计划的分享按钮仍提供只读快照，邀请同行请使用房间内的邀请链接。
- 初次生成行程时会尝试通过 DeepSeek 联网搜索查参考价格，并核验可读取的来源；动态价格无法核实时明确标成未知。费用页允许选填每人每晚住宿、市内交通和往返交通预估，显示已覆盖项目小计及未计入项目。预估与实际付款分开记录，均不代表已预订或实时价格。线路、营业、预约及价格出发前仍需核实。
- 城市卡片及对比页中的六座热门城市费用仍是标记明确的示例；随机飞镖从首批 50 座配图城市等概率抽选，支持多选心仪省份和排除省份，避免出发地、候选及已跳过城市，并优先本轮未抽过的城市。省份范围内无结果时显示恢复与调整入口。更广泛的城市可搜索、手填和用 AI 规划。
- 未提供预订或支付。素材来源见 public/credits.html。

费用预估会随个人方案保存；房间内保存后同步给伙伴，不清除对方案的投票。修改行程天数时，住宿按新晚数重算；旧的联网查价若不再匹配日期、住宿、天数或景点，则不计入小计。缺少的餐饮、门票和交通会继续列为未计入，不按 0 元补齐。

Province-based darts: the first throw offers optional multi-select preferred/excluded provinces. No preferred provinces means nationwide directory coverage; exclusions always apply. Opposing choices are mutually exclusive. Only Save commits settings; dismissing the dialog preserves prior settings. All mapped directory destinations are sampled uniformly without mood/budget weighting; local preference and rejection state survives reload. Non-curated city results support reject, candidate save and AI planning. Taiwan city data is currently unavailable and explicitly disclosed in the selector.

## 真实旅行房间
点击「和朋友一起」创建房间，填写昵称并复制邀请链接。朋友填写自己的昵称加入，最多 12 人。各自添加城市和投票，发起人从候选里选择城市，用现有 DeepSeek 流程生成或编辑详细行程，设置出发日期后点击「同步到旅行房间」。每位成员只能确认自己对当前版本的意见；发布新版本会清空确认，过期发布与确认会被拒绝。发起人可轮换邀请链接、关闭和重新开放房间；普通成员可退出。

访问条件：网站访问权限与房间权限分别检查。当前网站若仍是仅所有者可访问，必须先通过 Sites 分享设置给朋友访问权，或明确开放网站访问，朋友才可打开邀请。网站公开访问；创建房间、AI 调用和房间协作均无需登录。匿名创建者由浏览器保存的随机标识限额（最多 30 个房间），网络另有每分钟创建频率保护。房间加入、读取、投票以随机成员凭证验证；数据库只保存凭证摘要。昵称不等同实名认证。清除本机数据后需要重新加入；跨设备不会自动认作同一成员，也不会自动恢复发起人身份。

存储：`.openai/hosting.json` 声明逻辑 D1 绑定 `DB`；`db/schema.ts` 为 schema，`drizzle/` 保存追加式迁移。运行 `npx drizzle-kit generate` 生成新迁移，构建将其打包到 `dist/.openai/drizzle/`。不要修改已部署迁移。Worker 通过有版本条件的 UPDATE 防止并发覆盖，不在运行时建表。房间失败保留个人草稿，提交失败不显示成功。

本地运行使用 Node 24 的 SQLite，数据位于忽略提交的 `.local/rooms.sqlite`。`npm test` 测试独立成员、并发投票、角色限制、邀请轮换、失效凭证和版本确认；本地两个源（127.0.0.1 和 localhost）可模拟不同设备身份。生产数据库不使用这份本地测试数据。
## City photo cards
The city result displays 1–3 sourced photos before the decision actions. Seven cities ship reviewed local Unsplash photographs and credits; other destinations use a public Wikipedia PageImages lookup with coordinate matching and Commons attribution. Image bytes are proxied through the same origin to avoid requiring direct browser access to Wikimedia. Upstream outages or missing free photos show a retryable empty state, never another city’s picture. Nationwide sampling is unchanged. No model call is used for photography.

## Cream visual theme
The 2026-09-21 redesign follows the supplied butter-yellow and plush-toy reference. `public/cream.css` owns the new palette, materials and responsive presentation; `app.js` places the companion welcome section above the mobile map and in the desktop discovery panel. All existing filters, AI flows, candidate state and shared room APIs remain in place. Nunito is self-hosted with its OFL license.
