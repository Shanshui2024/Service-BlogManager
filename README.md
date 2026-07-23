# 写作工具 (Writer)

博客可视化写作工具，**纯前端、零后端**。

所有"读库 / 写库"都在**用户浏览器里完成**：用 GitHub OAuth 登录（PKCE 流程，无需后端、无需 secret）拿到 token，然后**现场**直接调用 GitHub Contents API 读写目标仓库。Vercel（或任意静态托管）只负责把这几个静态文件发给浏览器，**不持有任何 token、不保存任何状态**。

## 特性

- 文章列表 / 搜索（中文友好）/ 新建 / 编辑（实时 MDX 预览）/ 复制 / 删除
- 标签聚合与中文子串搜索；分类卡片视图（与网站 MONO 风格一致）
- 可视化配置 `config.yml`：站点信息、Giscus 评论、社交链接、导航、分类 Slug、分类 / 标签颜色
- 标签与分类颜色即时保存（无需进入配置页）
- 目标仓库由页面上的「仓库设置」填写（`owner/repo` + 分支 + 根目录），不写死
- 每次保存 = 一次 GitHub commit（现场修改存库）
- MONO 风格界面：方角、1px 边框、等宽字体、无阴影、opacity 动画（≤500ms）

## 配置（仅需一步）

打开 `public/index.html`，把顶部的 `GH_CLIENT_ID` 改成你的 GitHub OAuth App 的 **Client ID**：

```html
<script>
  window.GH_CLIENT_ID = "你的_CLIENT_ID";
</script>
```

不需要 Client Secret（PKCE 流程，secret 留在 GitHub 端，浏览器侧只持有短期 code_verifier）。

### 创建 GitHub OAuth App

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
2. Homepage URL：你的线上地址（如 `https://writer.example.com`）
3. Authorization callback URL：**`https://你的线上地址/`**（必须带末尾斜杠，且是根路径，因为回调在首页处理）
4. 记下 Client ID，填进 `index.html`

> OAuth App（不是 GitHub App）即可，scope 为 `repo`，用于读写你的博客仓库。

## 使用

1. 打开线上页面 → 点「使用 GitHub 登录」→ 授权。
2. 登录后点右上「仓库设置」，填 `owner/repo`（如 `Shanshui2024/Site-BlogRepo`）和分支（默认 `main`），保存。
3. 之后所有读写都**现场**打到该仓库的 `data/posts/**` 和 `config.yml`。

token 仅存于浏览器 `localStorage`，刷新/重开需重新登录（不依赖任何服务器）。

## 部署（纯静态）

任意静态托管均可，无需 build、无需环境变量、无需服务端。

### Vercel

1. Import Git Repository → 选择本仓库（如 `Service-BlogManager`）。
2. Framework Preset 选 **Other**（或留空），无需 Build Command / Output Directory。
3. Deploy。Vercel 会把 `public/` 作为静态站点托管（若在仓库根，将 `public` 内容放在根或设置根目录为 `public`）。

> 若仓库根目录直接是项目根（含 `public/`），Vercel 默认会把根目录静态文件 + `public/` 一起托管。把 `public/index.html` 放到站点根最省事；也可在 Vercel 的项目设置里把 "Output Directory" 设为 `public`。

### 其他（GitHub Pages / Netlify / Cloudflare Pages / Nginx）

直接把 `public/` 下的 `index.html`、`styles.css`、`app.js` 作为静态文件托管即可。回调地址用首页根路径。

## 目录结构

```
shanshui-writer/
  public/             # 纯前端（原生 HTML / CSS / JS）
    index.html         # 含 GH_CLIENT_ID 配置
    styles.css
    app.js             # 直接调 GitHub API（OAuth PKCE + Contents API）
  package.json
```

## 安全说明

- 没有后端，因此**没有服务器能拿到你的 token**；token 只在你自己浏览器里。
- 使用 OAuth App 的 `repo` scope，请只授权你信任的仓库所属账号。
- 因为 token 在浏览器，任何能打开该页面的人登录后都能改你配置的仓库——请通过托管平台的访问控制（如 Vercel 密码保护 / 私有部署）限制访问。
