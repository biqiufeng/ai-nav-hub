# AI 导航聚合站（AI Nav Hub）

一个零外部依赖、每日自动聚合国内外主流 AI 工具导航站与新品动态的个人 AI 导航聚合项目。后端采用 Python 3 标准库实现多源抓取、占位图剔除与共识加权去重；前端采用零框架原生 HTML / CSS / ES Module，遵循现代 Web 最佳实践与克制、细腻的苹果级交互与状态动效。

## 核心特性

- **四大实用频道**：基于响应式自适应顶栏（`首页` 全库聚合导航、`AI` 大模型聚合工作台、`工具` 12 款本地开发者实用工具箱 + 导航、`摸鱼` 14 大平台每小时热榜 + 休闲导航）。
- **全量多源聚合与两阶段去重**：全量遍历国内外 9 大公开 AI/开发导航目录与 RSS 订阅，统一去除追踪参数与多语言路径前缀并按规范化域名/路径合并，再将聚合页包装条目归并至官方主域名。
- **零灰色地球 / 三层图标回退**：自动识别并过滤源站懒加载默认占位图（如出现频次 `>= 4` 的默认图标），前端按「真实图标 → 高清 Favicon → 域名哈希质感首字母 Monogram」平滑降级。
- **每日全量 + 每小时热榜工作流**：通过 `flock` 防并发锁 + `crontab` 每日 `04:00` 定时爬取全库、`每小时 15 分` 刷新热榜；抓取总数低于安全阈值时自动保留线上旧版 `catalog.json`，并通过拷贝备份 + 单次 `os.replace` 实现零停机原子更新。
- **桌面端快速侧栏 + 移动端手势抽屉**：
  - 桌面端（`>= 960px`）左侧固定快速选择栏：快速视图（全部精选 / 多源热门 / 国内主流 / 海外主流 / 我的收藏）、9 大分类 Scrollspy 联动、8 大源站直选；
  - 移动端（`< 960px`）采用水平 `scroll-snap` + 滚动驱动背景渐变的原生手势侧滑抽屉。
- **细节体验**：`/` 或 `⌘K` 直达搜索、`localStorage` 收藏沉淀、原地 4 秒二次确认清空收藏、HTTP 环境剪贴板降级、深浅色自适应与手动覆盖。

## 遵循的 Modern Web Guidance 规范

前端严格按 GoogleChrome `modern-web-guidance` 落地并包含跨浏览器降级（Safari / Firefox）：

1. **`dark-mode`**：`:root { color-scheme: light dark }`、`light-dark()` 与 `prefers-color-scheme` 降级、合规对比度自定义滚动条（不对其做过渡动画）。
2. **`dark-mode-toggle`**：`<meta name="color-scheme">` 紧跟同步内联防闪烁脚本、双态切换（可收回至跟随系统）、跨标签 `storage` 同步。
3. **`content-first-noise-reduction`**：单行紧凑顶部吸顶栏、`container-type: scroll-state` 下滑收起/上滑归位（附滚动滞后降级），去除冗余引导文案与后台明细展示以聚焦工具检索。
4. **`light-dismiss-a-dialog`**：原生 `<dialog closedby="any">` + `showModal()`、`overscroll-behavior: contain`、按压/抬起坐标核验防止划选文本拖出框外误关闭。
5. **`animate-to-from-top-layer`**：`@starting-style` + `overlay` + 独立声明 `transition-behavior: allow-discrete`，并实现 `canTransitionDisplay()` 探测与 `data-closing` 退场动画降级。
6. **`motion`**：全站仅动画合成层属性（`transform` / `opacity`），空间位移与缩放均受 `@media (prefers-reduced-motion: no-preference)` 约束。
7. **`defer-rendering-heavy-content`**：首屏折叠线以下卡片启用 `content-visibility: auto` 并配对 `contain-intrinsic-size`。
8. **`scrollspy`**：侧栏分类锚点使用 `scroll-target-group: auto` 与 `:is(:target-current, .target-current)`，配 `IntersectionObserver` 降级。
9. **`navigation-drawer`**：移动端手势抽屉使用水平 `scroll-snap-type: x mandatory`、`100svh`、`scroll-timeline` 联动遮罩及对应特性探测降级。

## 聚合数据源与友情链接策略

严格尊重各站点访问与反爬策略，不绕过任何 403 / 验证码校验：

| 区域 | 站点 | 接入方式 |
|---|---|---|
| 国内主流 | [AI 工具集](https://ai-bot.cn/) · [鱼皮 AI 导航](https://ai.codefather.cn/) · [AI 智库](https://ai-zhiku.com/) · [AIbase 基地](https://www.aibase.com/zh/tools) · [WaytoAGI](https://www.waytoagi.com/zh) · [程序员宝盒](https://www.baoboxs.com/) | 每日全量 + 每小时热榜 |
| 海外主流 | [Product Hunt](https://www.producthunt.com/)（官方 RSS）· [FutureTools](https://www.futuretools.io/) · [Futurepedia](https://www.futurepedia.io/) | 每日自动聚合 |

> **前后台分离**：公开首页 `/` 仅面向访客展示工具检索与导航，不包含后台统计与友链明细；站点运维明细与来源归属统一收口至独立 `/admin/` 页面（默认设置 `X-Robots-Tag: noindex, nofollow` 且不在首页留入口）。

## 目录结构

```text
ai-nav-hub/
├── Dockerfile                # Caddy + Python 3 轻量镜像
├── docker-compose.yml        # Web 托管 + 每日自动爬取编排
├── crawler/
│   └── fetch_all.py          # Python 3 零依赖多源聚合爬虫
├── deploy/
│   ├── install.sh            # 通用 ECS 一键安装/升级脚本（Caddy / Nginx + Crontab）
│   ├── Caddyfile             # Caddy 静态服务配置（zstd/gzip 压缩、缓存与安全头）
│   ├── nginx.conf.template   # Nginx 站点配置模板
│   ├── refresh_hotlist.sh    # 每小时更新全网热榜（hotlist.json）
│   └── run_weekly_crawl.sh   # 带 flock 互斥锁与 30 天日志轮转的定时执行脚本
└── web/
    ├── index.html            # 公开浏览首页
    ├── nav.js                # 响应式自适应顶栏与外观同步
    ├── styles.css
    ├── app.js
    ├── favicon.png
    ├── apple-touch-icon.png
    ├── logo.jpg
    ├── tools/                # 在线开发者工具箱与导航（/tools/）
    ├── moyu/                 # 全网实时热榜与摸鱼导航（/moyu/）
    └── admin/                # 独立数据后台（/admin/，noindex）
```

## 本地快速运行

需要 **Python 3.10+**：

```bash
# 1. 生成本地数据文件 web/data/catalog.json
python3 crawler/fetch_all.py --output web/data/catalog.json

# 2. 启动本地静态服务预览
python3 -m http.server 8080 --directory web
```

浏览器访问 `http://127.0.0.1:8080/`。

## 换 ECS 随时一键部署

无论迁移到任何阿里云 / 腾讯云 ECS（Ubuntu / Debian / CentOS / Alibaba Cloud Linux），均支持以下两种零折腾部署方式（**记得在云厂商安全组/防火墙放行对应端口**）：

### 方式一：宿主机一键脚本（自动配 Caddy/Nginx + 首次爬取 + 每日定时任务）

```bash
# 默认：安装到 /opt/ai-nav-hub，监听 :80，每日 04:00 自动爬取
curl -fsSL https://raw.githubusercontent.com/biqiufeng/ai-nav-hub/main/deploy/install.sh | sudo bash
```

常用自定义参数（通过环境变量传入）：

```bash
# 1. 如果机房未备案，直接改用 8080 端口
curl -fsSL https://raw.githubusercontent.com/biqiufeng/ai-nav-hub/main/deploy/install.sh | sudo SITE_ADDR=:8080 bash

# 2. 绑定已解析域名（Caddy 自动申请 HTTPS 证书）
curl -fsSL https://raw.githubusercontent.com/biqiufeng/ai-nav-hub/main/deploy/install.sh | sudo SITE_ADDR=nav.example.com bash

# 3. 若服务器已有 Nginx 并希望沿用 Nginx
curl -fsSL https://raw.githubusercontent.com/biqiufeng/ai-nav-hub/main/deploy/install.sh | sudo WEB_SERVER=nginx SITE_ADDR=:80 bash
```

### 方式二：Docker Compose（不污染宿主机环境）

```bash
git clone https://github.com/biqiufeng/ai-nav-hub.git
cd ai-nav-hub

# 默认 80 端口启动（如需 8080 端口可改为 PORT=8080 docker compose up -d --build）
docker compose up -d --build
```

容器启动后会自动运行首次爬取并每隔 24 小时（`CRAWL_INTERVAL_SECONDS=86400`）后台自动刷新数据。

## Cloudflare Workers 免费托管与绑定域名

如果希望免服务器运维、直接使用全球 CDN 与免费 HTTPS 域名访问，可通过 Cloudflare Workers Static Assets 部署 `web/` 目录：

```bash
# 1. 安装开发依赖（含官方 cf CLI）与生成数据
npm install
python3 crawler/fetch_all.py --output web/data/catalog.json

# 2. 登录 Cloudflare 并部署（可选传入已在 Cloudflare 托管的自定义域名）
npx cf auth login
CF_CUSTOM_DOMAIN=ai.example.com npx cf deploy ./web
```

### 自动定时爬取与同步到 Cloudflare Pages（GitHub Actions）

仓库已内置 [scheduled-cloudflare-deploy.yml](./.github/workflows/scheduled-cloudflare-deploy.yml)，零服务器依赖自动保持线上数据新鲜：
- 每日 `04:00 (UTC+8)` 全量抓取 9 大来源工具索引 + 14 平台热榜并部署至 Cloudflare Pages；
- 每 `2` 小时第 `15` 分增量刷新 `hotlist.json` 并发布（月度部署次数约 390 次，安全控制在 Pages 免费版 500 次/月上限内）。

如需手动在自有仓库启用，在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：
- **Secrets**：`CLOUDFLARE_API_TOKEN`（含 `Pages:Edit` 权限）、`CLOUDFLARE_ACCOUNT_ID`
- **Variables**：`CF_PAGES_PROJECT`（Pages 项目名）、`CF_LIVE_URL`（线上域名根地址，供热榜刷新复用已有 `catalog.json`）

## License

[MIT](./LICENSE)
