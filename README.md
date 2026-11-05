# 紫微斗数 · 静态排盘

Apple 风格极简、完全离线可用、基于 **iztro 真实排盘**的紫微斗数单页小工具。打开 `index.html` 即用，无需安装、无需构建、无需联网，所有计算都在浏览器本地完成，不上传任何数据。

---

## 目录结构

```
ziwei-doushu-static/
├── index.html                  # 单页入口（表单 + 命盘 + 详情浮层骨架）
├── favicon.svg                 # 本地 SVG 图标（4×4 宫格轮廓，无外链）
├── .nojekyll                   # GitHub Pages：跳过 Jekyll 处理
├── .gitignore
├── LICENSE                     # 上游项目 MIT 许可
├── README.md
├── assets/
│   ├── css/
│   │   └── styles.css          # 设计令牌 + 全部样式（亮暗主题 / 响应式 / 打印）
│   └── js/
│       ├── engine.js           # 纯逻辑层：iztro 封装 / 数据规范化 / 运限视图 / 星曜释义
│       ├── chart.js            # DOM 渲染层：12 宫格 / 中宫 / 徽标 / 详情浮层
│       └── app.js              # 应用编排层：表单 / 状态 / 三态 / 主题 / 存储 / hash
└── vendor/
    ├── iztro.min.js            # iztro@2.5.8 浏览器 UMD 构建（随仓库提交）
    └── LICENSE-iztro.txt       # iztro MIT 许可
```

脚本按 `vendor → engine → chart → app` 顺序以普通 `<script>` 标签引入，全部为相对路径。

---

## 两种运行方式

### ① 本地双击（最简单）

直接双击 `index.html`，用浏览器打开即可。**不需要安装任何东西、不需要本地服务器、断网也能正常排盘**。所有资源（脚本、样式、图标）都是本地文件，`file://` 协议下可直接运行。

> 若浏览器对本地文件读取有额外限制，可用任意静态服务器打开本目录，但项目本身不依赖服务器。

### ② 部署到 GitHub Pages

1. 在 GitHub 新建一个公开仓库（例如 `ziwei-doushu`），不要勾选初始化 README。
2. 在本目录执行：
   ```bash
   git init
   git add .
   git commit -m "init: 紫微斗数静态排盘"
   git branch -M main
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. 打开仓库 **Settings → Pages**。
4. **Build and deployment → Source** 选择 **Deploy from a branch**。
5. **Branch** 选 `main`，目录选 `/ (root)`，点击 **Save**。
6. 等几十秒后访问 `https://<用户名>.github.io/<仓库名>/` 即可。

仓库内的 `.nojekyll` 用于让 GitHub Pages 跳过 Jekyll 处理，保证静态文件原样发布。

---

## 功能清单

- **出生信息表单**：公历年月日、12 时辰下拉（子…亥，值 0–11）、性别、姓名（选填），含校验与逐字段错误提示。
- **真实排盘**：调用 `iztro.astro.bySolar()`，无任何占位盘或假数据。
- **12 宫命盘**：标准 4×4 外圈 12 格 + 中央 2×2 中宫，固定地支方位。每格显示宫名、宫干支、主星（亮度 + 四化徽标）、辅星与杂曜（超 6 个折叠为「+N」）、大限虚岁、命宫 / 身宫标识；空宫给出「借对宫」提示。
- **中宫**：姓名 / 生日、四柱、五行局、命主身主、生肖星座、农历日期。
- **宫位详情浮层**：点任意宫查看该宫全部主星 / 辅星 / 杂曜 / 运限流曜的亮度、四化、scope 与白话释义，以及宫干支、大限区间、长生 / 博士 / 岁前 / 将前十二神、对宫借星。桌面居中弹层、移动端底部抽屉；遮罩点击、Esc、关闭按钮均可关闭，带焦点管理。
- **本命 / 大限 / 流年 三态**：iOS 风格分段控件。运限四化以「透明底 + 1px 同色描边」徽标与本命四化区分，当前大限 / 流年宫高亮；`horoscope()` 全程 try/catch 容错，失败静默回退本命盘。
- **亮暗主题**：`html[data-theme]`，localStorage 记忆 + `prefers-color-scheme` 兜底。
- **本地记忆**：保存最近一次输入与主题，重开自动回填并自动重新排盘（只存输入参数）。
- **URL hash 复现**：`#d=2000-8-16&t=2&g=m&n=xxx`，提供「复制分享链接」；剪贴板不可用时降级为选中文本提示。
- **3 个示例盘**：点击后走与手动输入完全相同的 `bySolar` 真实排盘流程。
- **打印**：`@media print` 隐藏表单与按钮，命盘铺满 A4。
- **基础无障碍**：表单 label 关联、宫格 `role="gridcell"` 且可键盘聚焦、浮层 `role="dialog"` + `aria-modal` + 焦点管理、`focus-visible` 轮廓。

---

## 技术说明

- **零构建 / 零外链**：纯 HTML + CSS + 原生 JavaScript。无打包器、无 npm 依赖、无 ES module（`type="module"` 在 `file://` 下会被 CORS 拦截）、无 `fetch` / `XMLHttpRequest`、无 CDN、无 Google Fonts、无外部图片。字体使用系统字体栈，图标仅 3 处内联 SVG。
- **三层分工**：
  - `engine.js` 是**不依赖 DOM 的纯逻辑模块**，封装 `config` / `bySolar` / `horoscope`、数据规范化、运限视图构建与 14 主星 + 四化的名词释义字典，可在 Node 中独立测试。
  - `chart.js` 只负责把纯数据渲染成 DOM。
  - `app.js` 负责表单、状态、主题、localStorage、URL hash 与错误态编排。
  三者均以 IIFE 挂到 `window.ZW` 命名空间，普通 `<script>` 顺序加载。
- **时辰索引不是小时**：传给引擎的 `timeIndex` 是 `0–11` 的**时辰地支索引**（0=子、1=丑、2=寅 … 11=亥），不是 0–23 的小时数。
- **换年口径**：`iztro.astro.config({ yearDivide: 'normal' })`，即正月初一换年，对齐主流排盘软件。
- **对宫计算**：`(index + 6) % 12`；`palaces[0]` 为寅宫，按固定地支方位映射到 4×4 网格。
- **响应式**：375px 宽无横向溢出（`repeat(4, minmax(0,1fr))` + `min-width:0` + 紧凑字号 + 折叠杂曜），移动端输入框 16px 防 iOS 聚焦缩放，<360px 降级为 2 列列表。
- **设计系统**：Apple 工具化转译（Modern Minimal 85% + Editorial Monocle 15%），单一强调色，卡片默认无阴影，阴影仅用于分段控件滑块与详情浮层，动效 150–200ms 且 `prefers-reduced-motion` 归零。

---

## 数据源与许可

- 排盘引擎 **iztro@2.5.8**（MIT），许可证全文见 [`vendor/LICENSE-iztro.txt`](vendor/LICENSE-iztro.txt)；`vendor/iztro.min.js` 已随仓库提交，离线可用。
- 上游项目 **Renhuai123/ziwei-doushu**（MIT），许可证全文见 [`LICENSE`](LICENSE)。
- 星曜白话文字为本项目内置的**通用名词释义**，仅用于理解术语，不构成任何命理断语或运势结论。

---

## 已知边界

- 不做真太阳时、时区与经度校正，按用户填写的公历日期 + 时辰索引排盘。
- 不做 AI 解读、合盘、命理百科、古籍检索、多语言、多页路由、登录与云同步。
- 无后端、无 API Key、无任何联网请求，数据不上传。
- 公历输入范围 1900–2100 年（与表单 `min` / `max` 一致）。
- 大限 / 流年以**打开页面当天**为运限日期计算，未提供自定义运限日期选择。
- 宫格内仅主星显示亮度与本命四化徽标；辅星、杂曜的亮度与四化在宫位详情浮层完整呈现；运限四化若在辅星上，宫格内以描边徽标叠加，浮层另有「运限四化」总览保证信息不丢。
- 本工具只呈现排盘数据，不构成任何命理建议。
