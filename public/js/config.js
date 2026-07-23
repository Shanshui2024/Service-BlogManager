// config.js — read/write config.yml, taxonomy helpers, and the
// tag/category color panels.
import { readFile, writeFile, getSha } from "./github.js";
import { state } from "./storage.js";
import { toast, esc, colorToHex, cssEsc } from "./ui.js";
import { parseConfigYaml, patchYamlText } from "./yaml.js";

export async function readConfigText() {
  try {
    return await readFile("config.yml");
  } catch {
    return null;
  }
}

export async function getConfigStructured() {
  const raw = await readConfigText();
  const parsed = raw ? parseConfigYaml(raw) : {};
  state.cfg = parsed;
  return parsed;
}

export async function putConfig(obj) {
  // Read the original config.yml text and patch only the changed values.
  const original = await readConfigText();
  if (!original) {
    // File doesn't exist yet — create it using the full dump.
    const { dumpConfig } = await import("./yaml.js");
    await writeFile("config.yml", dumpConfig(obj), undefined, "update config.yml");
    return;
  }
  // Build a flat changes map from obj.
  const changes = {};
  // Top-level scalars
  for (const k of [
    "title","description","author","language","timezone","url","base",
    "theme","comments","reading_time","toc","license","favicon",
    "icp","moe","copyright","footerLinks","showBuildInfo",
  ]) {
    if (k in obj) changes[k] = String(obj[k]);
  }
  // Giscus sub-keys
  if (obj.giscus && typeof obj.giscus === "object") {
    for (const [k, v] of Object.entries(obj.giscus)) {
      changes[`giscus.${k}`] = String(v);
    }
  }
  // Socials sub-keys
  if (obj.socials && typeof obj.socials === "object") {
    for (const [k, v] of Object.entries(obj.socials)) {
      changes[`socials.${k}`] = String(v);
    }
  }
  // Category slugs (key: value pairs under categorySlugs)
  if (obj.categorySlugs && typeof obj.categorySlugs === "object") {
    for (const [k, v] of Object.entries(obj.categorySlugs)) {
      changes[`categorySlugs.${k}`] = String(v);
    }
  }
  // Tag slugs (key: value pairs under tagSlugs)
  if (obj.tagSlugs && typeof obj.tagSlugs === "object") {
    for (const [k, v] of Object.entries(obj.tagSlugs)) {
      changes[`tagSlugs.${k}`] = String(v);
    }
  }
  // Category colors
  const catColors = obj.categoryColors || (obj.categories && obj.categories.colors) || {};
  for (const [k, v] of Object.entries(catColors)) {
    changes[`categoryColors.${k}`] = String(v);
  }
  // Tag colors
  const tagColors = obj.tagColors || (obj.tags && obj.tags.colors) || {};
  for (const [k, v] of Object.entries(tagColors)) {
    changes[`tagColors.${k}`] = String(v);
  }
  // Navigation items — match by label to update href
  if (Array.isArray(obj.navigation)) {
    // We can't patch navigation easily with the line-by-line approach
    // because each item spans multiple lines. For now skip navigation
    // from the patcher (it'll remain unchanged). The user can edit the
    // raw file for navigation changes.
  }
  const patched = patchYamlText(original, changes);
  let sha = undefined;
  try { sha = await getSha("config.yml"); } catch {}
  await writeFile("config.yml", patched, sha || undefined, "update config.yml");
}

// Read everything currently in the form (sections + per-section rows) and
// merge it onto `state.cfg` so unrelated keys (giscus, socials, …) are
// preserved on save.
export function gatherConfig() {
  const form = document.getElementById("config-form");
  const obj = { ...(state.cfg || {}) };
  if (!form) return obj;

  // Simple scalar inputs
  form.querySelectorAll("[data-cfg]").forEach((el) => {
    const k = el.getAttribute("data-cfg");
    if (k.startsWith("__extra__")) return;
    obj[k] = el.value;
  });

  // Boolean toggles
  form.querySelectorAll("[data-cfg-bool]").forEach((el) => {
    obj[el.getAttribute("data-cfg-bool")] = !!el.checked;
  });

  // Giscus sub-fields
  const giscus = { ...(obj.giscus || {}) };
  form.querySelectorAll("[data-giscus]").forEach((el) => {
    giscus[el.getAttribute("data-giscus")] = el.value;
  });
  obj.giscus = giscus;

  // Socials sub-fields
  const socials = { ...(obj.socials || {}) };
  form.querySelectorAll("[data-social]").forEach((el) => {
    const k = el.getAttribute("data-social");
    if (el.value) socials[k] = el.value;
    else delete socials[k];
  });
  obj.socials = socials;

  // Navigation list (objects with label + href)
  const nav = [];
  form.querySelectorAll("[data-nav-row]").forEach((row) => {
    const label = row.querySelector("[data-nav-label]")?.value.trim();
    const href = row.querySelector("[data-nav-href]")?.value.trim();
    if (label || href) nav.push({ label, href });
  });
  if (form.querySelector("[data-nav-row]")) obj.navigation = nav;

  // Category slug list (objects with key + value)
  const slugs = {};
  form.querySelectorAll("[data-slug-row]").forEach((row) => {
    const k = row.querySelector("[data-slug-key]")?.value.trim();
    const v = row.querySelector("[data-slug-val]")?.value.trim();
    if (k) slugs[k] = v;
  });
  if (form.querySelector("[data-slug-row]")) obj.categorySlugs = slugs;

  // Tag slug list (objects with key + value)
  const tagSlugs = {};
  form.querySelectorAll("[data-tag-slug-row]").forEach((row) => {
    const k = row.querySelector("[data-tag-slug-key]")?.value.trim();
    const v = row.querySelector("[data-tag-slug-val]")?.value.trim();
    if (k) tagSlugs[k] = v;
  });
  if (form.querySelector("[data-tag-slug-row]")) obj.tagSlugs = tagSlugs;

  return obj;
}

export async function saveConfig() {
  try {
    const obj = gatherConfig();
    await putConfig(obj);
    state.cfg = obj;
    toast("配置已保存", "ok");
  } catch (e) {
    toast("保存失败：" + e.message, "err");
  }
}

// ===========================================================================
// Form rendering
// ===========================================================================

const LABEL_ZH = {
  title: "站点标题",
  description: "站点描述",
  author: "作者",
  language: "语言",
  timezone: "时区",
  url: "首页 URL",
  base: "Base",
  theme: "主题",
  comments: "评论",
  reading_time: "阅读时间",
  toc: "目录",
  license: "许可证",
  favicon: "站点图标 URL",
  icp: "ICP 备案号",
  moe: "萌备号",
  copyright: "页脚版权",
  footerLinks: "页脚自定义 HTML",
  showBuildInfo: "显示构建信息",
};

function labelOf(k) {
  return LABEL_ZH[k] || k;
}

function row(label, inputHtml, extraClass = "") {
  return `<div class="cfg-row${extraClass ? " " + extraClass : ""}">
    <label class="cfg-label">${esc(label)}</label>${inputHtml}
  </div>`;
}

function input(k, value, placeholder = "") {
  return `<input class="input cfg-input" data-cfg="${esc(k)}" value="${esc(
    value || ""
  )}" placeholder="${esc(placeholder)}" />`;
}

function boolInput(k, value) {
  return `<label class="cfg-toggle"><input type="checkbox" data-cfg-bool="${esc(
    k
  )}" ${value ? "checked" : ""} /><span class="cfg-toggle-track"></span></label>`;
}

function giscusInput(field, value) {
  return `<input class="input cfg-input" data-giscus="${esc(
    field
  )}" value="${esc(value || "")}" />`;
}

function socialInput(k, value) {
  return `<input class="input cfg-input" data-social="${esc(k)}" value="${esc(
    value || ""
  )}" />`;
}

function section(title, hint, content) {
  return `<section class="cfg-section">
    <h3 class="cfg-section-title">${esc(title)}<span class="cfg-section-hint">${esc(
    hint || ""
  )}</span></h3>
    <div class="cfg-section-body">${content}</div>
  </section>`;
}

function renderScalarSection(cfg) {
  const fields = [
    "title",
    "description",
    "author",
    "language",
    "timezone",
    "url",
    "base",
    "theme",
    "comments",
    "reading_time",
    "toc",
    "license",
  ];
  return fields
    .filter((k) => k in cfg || ["title", "description", "author", "language", "url"].includes(k))
    .map((k) => row(labelOf(k), input(k, cfg[k])))
    .join("");
}

function renderBooleanSection(cfg) {
  return ["showBuildInfo"]
    .filter((k) => k in cfg)
    .map((k) => row(labelOf(k), boolInput(k, cfg[k])))
    .join("");
}

function renderGiscusSection(cfg) {
  const g = cfg.giscus || {};
  const enabled = g.enabled !== false; // default on if any giscus key exists
  const fields = [
    ["repo", "启用评论（Giscus）"],
    ["repoId", "仓库 repo"],
    ["category", "分类 ID"],
    ["categoryId", "category ID"],
    ["mapping", "映射"],
    ["strict", "strict"],
    ["reactionsEnabled", "reactionsEnabled"],
    ["emitMetadata", "emitMetadata"],
    ["inputPosition", "inputPosition"],
    ["theme", "主题"],
    ["lang", "lang"],
  ];
  const rows = fields
    .map(
      ([f, label]) =>
        `<div class="cfg-row">
          <label class="cfg-label">${esc(label || f)}</label>
          <input class="input cfg-input" data-giscus="${esc(f)}" value="${esc(
          g[f] || ""
        )}" />
        </div>`
    )
    .join("");
  const toggle = `<div class="cfg-row">
    <label class="cfg-label">启用评论（Giscus）</label>
    <label class="cfg-toggle"><input type="checkbox" data-cfg-bool="giscusEnabled" ${
      enabled ? "checked" : ""
    } /><span class="cfg-toggle-track"></span></label>
  </div>`;
  return toggle + rows;
}

function renderSocialsSection(cfg) {
  const s = cfg.socials || {};
  const known = ["github", "twitter", "email", "bilibili", "rss"];
  const extras = Object.keys(s).filter((k) => !known.includes(k));
  const all = [...known, ...extras];
  return all
    .map(
      (k) => `<div class="cfg-row">
      <label class="cfg-label">${esc(k)}</label>
      <input class="input cfg-input" data-social="${esc(k)}" value="${esc(
        s[k] || ""
      )}" placeholder="https://..." />
    </div>`
    )
    .join("");
}

function renderNavigationSection(cfg) {
  const list = Array.isArray(cfg.navigation) ? cfg.navigation : [];
  const rows = list
    .map(
      (it, i) => `<div class="cfg-row cfg-row-array" data-nav-row>
      <label class="cfg-label">#${i + 1}</label>
      <div class="cfg-row-array-fields">
        <input class="input cfg-input" data-nav-label value="${esc(
          it.label || ""
        )}" placeholder="显示文字" />
        <input class="input cfg-input" data-nav-href value="${esc(
          it.href || ""
        )}" placeholder="/path 或 https://..." />
      </div>
      <button type="button" class="btn btn-sm cfg-row-del" data-nav-del>删除</button>
    </div>`
    )
    .join("");
  const addBtn = `<div class="cfg-row">
    <label class="cfg-label"></label>
    <button type="button" class="btn btn-sm" data-nav-add>+ 新增</button>
  </div>`;
  return rows + addBtn;
}

function renderCategorySlugSection(cfg) {
  const slugs =
    cfg.categorySlugs && typeof cfg.categorySlugs === "object"
      ? cfg.categorySlugs
      : {};
  const rows = Object.entries(slugs)
    .map(
      ([k, v]) => `<div class="cfg-row cfg-row-array" data-slug-row>
      <label class="cfg-label">分类 slug</label>
      <div class="cfg-row-array-fields">
        <input class="input cfg-input" data-slug-key value="${esc(
          k
        )}" placeholder="分类名（中文）" />
        <input class="input cfg-input" data-slug-val value="${esc(
          v || ""
        )}" placeholder="英文 slug" />
      </div>
      <button type="button" class="btn btn-sm cfg-row-del" data-slug-del>删除</button>
    </div>`
    )
    .join("");
  const addBtn = `<div class="cfg-row">
    <label class="cfg-label"></label>
    <button type="button" class="btn btn-sm" data-slug-add>+ 新增</button>
  </div>`;
  return rows + addBtn;
}

function renderTagSlugSection(cfg) {
  const slugs =
    cfg.tagSlugs && typeof cfg.tagSlugs === "object" ? cfg.tagSlugs : {};
  const rows = Object.entries(slugs)
    .map(
      ([k, v]) => `<div class="cfg-row cfg-row-array" data-tag-slug-row>
      <label class="cfg-label">标签 slug</label>
      <div class="cfg-row-array-fields">
        <input class="input cfg-input" data-tag-slug-key value="${esc(
          k
        )}" placeholder="标签名（中文）" />
        <input class="input cfg-input" data-tag-slug-val value="${esc(
          v || ""
        )}" placeholder="英文 slug" />
      </div>
      <button type="button" class="btn btn-sm cfg-row-del" data-tag-slug-del>删除</button>
    </div>`
    )
    .join("");
  const addBtn = `<div class="cfg-row">
    <label class="cfg-label"></label>
    <button type="button" class="btn btn-sm" data-tag-slug-add>+ 新增</button>
  </div>`;
  return rows + addBtn;
}

function renderFooterSection(cfg) {
  const rows = [];
  if ("favicon" in cfg)
    rows.push(row(labelOf("favicon"), input("favicon", cfg.favicon)));
  if ("icp" in cfg) rows.push(row(labelOf("icp"), input("icp", cfg.icp)));
  if ("moe" in cfg) rows.push(row(labelOf("moe"), input("moe", cfg.moe)));
  if ("copyright" in cfg)
    rows.push(
      row(
        labelOf("copyright"),
        `<textarea class="input cfg-input cfg-textarea" data-cfg="copyright" rows="2">${esc(
          cfg.copyright || ""
        )}</textarea>`
      )
    );
  if ("footerLinks" in cfg)
    rows.push(
      row(
        labelOf("footerLinks"),
        `<textarea class="input cfg-input cfg-textarea" data-cfg="footerLinks" rows="3">${esc(
          cfg.footerLinks || ""
        )}</textarea>`
      )
    );
  if ("showBuildInfo" in cfg)
    rows.push(row(labelOf("showBuildInfo"), boolInput("showBuildInfo", cfg.showBuildInfo)));
  return rows.join("");
}

export async function renderConfigForm() {
  const cfg = await getConfigStructured();
  const form = document.getElementById("config-form");
  if (!form) return;
  form.innerHTML =
    section("站点信息", "Site", renderScalarSection(cfg)) +
    section("Giscus", "评论", renderGiscusSection(cfg)) +
    section("社交链接", "Socials", renderSocialsSection(cfg)) +
    section("导航栏", "Navigation", renderNavigationSection(cfg)) +
    section("分类 Slug", "Category Slug", renderCategorySlugSection(cfg)) +
    section("标签 Slug", "Tag Slug", renderTagSlugSection(cfg)) +
    section("备案与页脚", "Footer", renderFooterSection(cfg));

  // Wire up add/delete buttons for navigation, category-slug, and tag-slug lists
  form.querySelectorAll("[data-nav-add]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const tmpl = form.querySelector("[data-nav-row]");
      if (!tmpl) return;
      const clone = tmpl.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => (i.value = ""));
      tmpl.parentNode.insertBefore(clone, btn.parentNode);
      wireNavRow(clone);
    })
  );
  form.querySelectorAll("[data-nav-row]").forEach(wireNavRow);

  form.querySelectorAll("[data-slug-add]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const tmpl = form.querySelector("[data-slug-row]");
      if (!tmpl) return;
      const clone = tmpl.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => (i.value = ""));
      tmpl.parentNode.insertBefore(clone, btn.parentNode);
      wireSlugRow(clone);
    })
  );
  form.querySelectorAll("[data-slug-row]").forEach(wireSlugRow);

  form.querySelectorAll("[data-tag-slug-add]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const tmpl = form.querySelector("[data-tag-slug-row]");
      if (!tmpl) return;
      const clone = tmpl.cloneNode(true);
      clone.querySelectorAll("input").forEach((i) => (i.value = ""));
      tmpl.parentNode.insertBefore(clone, btn.parentNode);
      wireTagSlugRow(clone);
    })
  );
  form.querySelectorAll("[data-tag-slug-row]").forEach(wireTagSlugRow);
}

function wireNavRow(row) {
  row.querySelector("[data-nav-del]")?.addEventListener("click", () => row.remove());
}
function wireSlugRow(row) {
  row.querySelector("[data-slug-del]")?.addEventListener("click", () => row.remove());
}
function wireTagSlugRow(row) {
  row.querySelector("[data-tag-slug-del]")?.addEventListener("click", () => row.remove());
}

export async function loadConfig() {
  await renderConfigForm();
}

// ===========================================================================
// Taxonomy + color panels
// ===========================================================================

export function getAllTags() {
  const set = new Set();
  for (const p of state.allPosts) for (const t of p.tags || []) if (t) set.add(t);
  return [...set].sort();
}

export function getAllCategories() {
  const set = new Set();
  for (const p of state.allPosts) {
    if (p.category) set.add(p.category);
    if (Array.isArray(p.categories)) for (const c of p.categories) if (c) set.add(c);
  }
  const cfg = state.cfg || {};
  if (cfg.categories && Array.isArray(cfg.categories.order)) {
    for (const c of cfg.categories.order) if (c) set.add(c);
  }
  if (cfg.categorySlugs && typeof cfg.categorySlugs === "object") {
    for (const c of Object.keys(cfg.categorySlugs)) if (c) set.add(c);
  }
  return [...set].sort();
}

// Each color panel is a self-contained editor: it has its own Save button that
// appears only when there are unsaved changes. Picking a color in the
// color-picker updates the hex text input (and vice-versa) on the same row.
function renderColorsPanel({ kind, containerId, listId, storageKey, title }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  const names = getAllTagsOrCategories(kind);
  const map = { ...(state[storageKey] || {}) };

  // Seed from the config file once (so colors persist across reloads).
  if (!state[storageKey] || Object.keys(state[storageKey]).length === 0) {
    const cfg = state.cfg || {};
    if (cfg[kind] && cfg[kind].colors) {
      Object.assign(map, cfg[kind].colors);
    } else if (kind === "categories" && cfg.categoryColors) {
      Object.assign(map, cfg.categoryColors);
    } else if (kind === "tags" && cfg.tagColors) {
      Object.assign(map, cfg.tagColors);
    }
  }

  const list = document.createElement("div");
  list.className = "color-list";
  list.id = listId;

  for (const n of names) {
    const hex = colorToHex(map[n] || "#888888");
    const row = document.createElement("div");
    row.className = "color-row";
    row.dataset.name = n;
    row.innerHTML = `
      <span class="c-name">${esc(n)}</span>
      <input type="color" class="swatch" data-kind="${kind}" data-color="${esc(
      n
    )}" value="${hex}" />
      <input type="text" class="input color-hex" data-kind="${kind}" data-color="${esc(
      n
    )}" value="${hex}" />
    `;
    list.appendChild(row);
  }

  const saveBar = document.createElement("div");
  saveBar.className = "color-savebar";
  saveBar.innerHTML = `<span class="color-savebar-hint">${
    names.length ? "" : "暂无" + title
  }</span><button type="button" class="btn btn-solid" data-color-save="${kind}" disabled>保存</button>`;

  container.appendChild(list);
  container.appendChild(saveBar);
  if (!names.length) list.innerHTML = `<div class="hint">暂无${title}</div>`;

  // Live-sync color picker ↔ hex input; mark dirty.
  list.querySelectorAll(".color-row").forEach((row) => {
    const swatch = row.querySelector(".swatch");
    const hex = row.querySelector(".color-hex");
    swatch.addEventListener("input", () => {
      hex.value = swatch.value;
      markDirty(kind);
    });
    hex.addEventListener("input", () => {
      const v = (hex.value || "").trim();
      if (/^#([0-9a-f]{6})$/i.test(v)) {
        swatch.value = v;
        markDirty(kind);
      }
    });
  });

  // Save handler: collect edited hexes and push to config.yml.
  const saveBtn = saveBar.querySelector("[data-color-save]");
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中…";
    try {
      const cfg = await getConfigStructured();
      const colors = {};
      list.querySelectorAll(".color-row").forEach((row) => {
        const name = row.dataset.name;
        const val = row.querySelector(".color-hex").value.trim();
        if (name) colors[name] = val;
      });
      // Write colors to the flat config keys (tagColors / categoryColors)
      // that the blog actually reads.
      if (kind === "categories") cfg.categoryColors = colors;
      if (kind === "tags") cfg.tagColors = colors;
      await putConfig(cfg);
      state.cfg = cfg;
      state[storageKey] = colors;
      saveBar.classList.remove("dirty");
      saveBtn.textContent = "已保存";
      setTimeout(() => (saveBtn.textContent = "保存"), 1200);
      toast("已保存颜色", "ok");
    } catch (e) {
      saveBtn.textContent = "保存";
      saveBtn.disabled = false;
      toast("保存失败：" + e.message, "err");
    }
  });
}

function getAllTagsOrCategories(kind) {
  return kind === "tags" ? getAllTags() : getAllCategories();
}

function markDirty(kind) {
  const bar = document
    .querySelector(`[data-color-save="${kind}"]`)
    ?.closest(".color-savebar");
  const btn = document.querySelector(`[data-color-save="${kind}"]`);
  if (!bar || !btn) return;
  bar.classList.add("dirty");
  btn.disabled = false;
  btn.textContent = "保存修改";
}

export function renderTagColorsPanel() {
  renderColorsPanel({
    kind: "tags",
    containerId: "tag-colors",
    listId: "tag-colors-list",
    storageKey: "tagColors",
    title: "标签",
  });
}

export function renderCategoryColorsPanel() {
  renderColorsPanel({
    kind: "categories",
    containerId: "category-colors",
    listId: "category-colors-list",
    storageKey: "categoryColors",
    title: "分类",
  });
}

// Legacy helpers kept for compatibility with posts.js imports.
export async function collectAndSaveColors(kind, names) {
  return saveConfigColors(kind, names);
}

export function saveConfigColors(kind, names) {
  return renderColorsPanel({ kind });
}
