# AI 导航聚合站（AI Nav Hub）

一个零外部依赖、每周自动聚合国内外主流 AI 工具导航站与新品动态的个人 AI 导航聚合项目。后端采用 Python 3 标准库实现多源抓取、占位图剔除与共识加权去重；前端采用零框架原生 HTML / CSS / ES Module，遵循现代 Web 最佳实践与克制、细腻的苹果级交互与状态动效。

## 核心特性

- **多源聚合与自动去重**：整合国内外公开 AI 导航目录与 RSS 订阅，去除追踪参数并按规范化域名/路径合并，优先展示多源共同收录的头部工具。
- **零灰色地球 / 三层图标回退**：自动识别并过滤源站懒加载默认占位图（如出现频次 `>= 4` 的默认图标），前端按「真实图标 → 高清 Favicon → 域名哈希质感首字母 Monogram」平滑降级。
- **每周自动化工作流**：通过 `flock` 防并发锁 + `crontab` 每周一 `04:00` 定时爬取；抓取总数低于安全阈值时自动保留线上旧版 `catalog.json`，并通过拷贝备份 + 单次 `os.replace` 实现零停机原子更新。
- **桌面端快速侧栏 + 移动端手势抽屉**：
  - 桌面端（`>= 960px`）左侧固定快速选择栏：快速视图（全部精选 / 多源热门 / 国内主流 / 海外主流 / 我的收藏）、9 大分类 Scrollspy 联动、8 大源站直选；
  - 移动端（`< 960px`）采用水平 `scroll-snap` + 滚动驱动背景渐变的原生手势侧滑抽屉。
- **细节体验**：`/` 或 `⌘K` 直达搜索、`localStorage` 收藏沉淀、原地 4 秒二次确认清空收藏、HTTP 环境剪贴板降级、深浅色自适应与手动覆盖。

## 遵循的 Modern Web Guidance 规范

前端严格按 GoogleChrome `modern-web-guidance` 落地并包含跨浏览器降级（Safari / Firefox）：

1. **`dark-mode`**：`:root { color-scheme: light dark }`、`light-dark()` 与 `prefers-color-scheme` 降级、合规对比度自定义滚动条（不对其做过渡动画）。
2. **`dark-mode-toggle`**：`<meta name="color-scheme">` 紧跟同步内联防闪烁脚本、双态切换（可收回至跟随系统）、跨标签 `storage` 同步。
3. **`content-first-noise-reduction`**：单行紧凑顶部吸顶栏、`container-type: scroll-state` 下滑收起/上滑归位（附滚动滞后降级）、次要运行统计折叠于 `<details>`。
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
| 国内主流 | [AI 工具集](https://ai-bot.cn/) · [鱼皮 AI 导航](https://ai.codefather.cn/) · [AI 智库](https://ai-zhiku.com/) · [AIbase 基地](https://www.aibase.com/zh/tools) · [WaytoAGI](https://www.waytoagi.com/zh) | 每周自动聚合 |
| 海外主流 | [Product Hunt](https://www.producthunt.com/)（官方 RSS）· [FutureTools](https://www.futuretools.io/) · [Futurepedia](https://www.futurepedia.io/) | 每周自动聚合 |
| 海外参考 | [There's An AI For That](https://theresanaiforthat.com/) · [Toolify.ai](https://www.toolify.ai/) | 返回 HTTP 403，仅保留底部友情链接参考 |

## 目录结构

```text
ai-nav-hub/
├── crawler/
│   └── fetch_all.py          # Python 3 零依赖多源聚合爬虫
├── deploy/
│   ├── Caddyfile             # Caddy 静态服务配置（zstd/gzip 压缩、缓存与安全头）
│   └── run_weekly_crawl.sh   # 带 flock 互斥锁与日志轮转的每周执行脚本
└── web/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── favicon.svg
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

## 服务器部署（Caddy + Crontab）

```bash
# 1. 上传至 /opt/ai-nav-hub/ 并执行首次爬取
chmod +x /opt/ai-nav-hub/crawler/fetch_all.py /opt/ai-nav-hub/deploy/run_weekly_crawl.sh
/opt/ai-nav-hub/deploy/run_weekly_crawl.sh

# 2. 配置 Caddy（需按实际域名或端口调整 deploy/Caddyfile）
sudo cp /opt/ai-nav-hub/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 3. 注册每周一凌晨 04:00 定时任务
(crontab -l 2>/dev/null; echo "0 4 * * 1 /opt/ai-nav-hub/deploy/run_weekly_crawl.sh") | crontab -
```

## License

[MIT](./LICENSE)
