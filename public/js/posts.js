// posts.js — article listing, editor, save/delete/copy, tags & categories.
import { getPost, savePost as apiSavePost, deletePost as apiDeletePost, getPosts } from "./api.js";
import { state } from "./storage.js";
import {
  toast,
  esc,
  nowInput,
  dateToInput,
  dateToYaml,
  slugifyTitle,
  updatePreview,
  setEditorStatus,
  helloTemplate,
  cssEsc,
} from "./ui.js";
import {
  getConfigStructured,
  getAllTags,
  getAllCategories,
  renderTagColorsPanel,
  renderCategoryColorsPanel,
} from "./config.js";
import { parseConfigYaml } from "./yaml.js";

const $ = (id) => document.getElementById(id);

function resetForm() {
  ["f-title", "f-date", "f-slug", "f-excerpt", "f-content"].forEach((id) => {
    const e = $(id);
    if (e) e.value = "";
  });
  ["f-draft", "f-pinned"].forEach((id) => {
    const e = $(id);
    if (e) e.checked = false;
  });
  const tags = $("f-tags");
  if (tags) tags.innerHTML = "";
  state.editingSlug = null;
  setEditorStatus("");
  const titleEl = $("f-title");
  if (titleEl) titleEl.readOnly = false;
  const catSel = $("f-category-select");
  if (catSel) {
    const t = catSel.querySelector(".cs-trigger");
    if (t) t.textContent = "选择分类…";
  }
  const ed = $("editor-title");
  if (ed) ed.textContent = "新建文章";
  const del = $("btn-delete");
  if (del) del.classList.add("hidden");
  const content = $("f-content");
  if (content) content.value = "";
}

function readForm() {
  const title = $("f-title").value.trim();
  const date = $("f-date").value;
  const category = (
    document.querySelector("#f-category-select .cs-trigger")?.textContent || ""
  ).trim();
  const categoryVal = category && category !== "选择分类…" ? category : "";
  const tags = [...document.querySelectorAll("#f-tags .chip")].map(
    (c) => c.dataset.tag
  );
  const excerpt = $("f-excerpt").value.trim();
  const draft = $("f-draft").checked;
  const pinned = $("f-pinned").checked;
  const content = $("f-content").value;
  const slug = ($("f-slug").value.trim()) || slugifyTitle(title);
  if (!title) {
    setEditorStatus("请填写标题", "err");
    throw new Error("title");
  }
  if (!slug) {
    setEditorStatus("请填写 slug", "err");
    throw new Error("slug");
  }
  const yaml = [
    "---",
    `title: ${title}`,
    `date: ${date ? dateToYaml(date) : dateToYaml(new Date())}`,
    `category: ${categoryVal || '""'}`,
    `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`,
    `draft: ${draft}`,
    `pinned: ${pinned}`,
    excerpt ? `excerpt: ${excerpt}` : "",
    "---",
    "",
    content,
  ]
    .filter(Boolean)
    .join("\n");
  return { slug, yaml, title };
}

async function openEditor(slug) {
  resetForm();
  state.editingSlug = slug || null;
  if (slug) {
    let result;
    try {
      result = await getPost(slug);
    } catch (e) {
      toast("读取文章失败：" + e.message, "err");
      return;
    }
    const p = parsePostFileLocal(result.raw);
    $("f-title").value = p.title;
    $("f-date").value = dateToInput(p.date);
    $("f-excerpt").value = p.excerpt || "";
    $("f-content").value = p.content || "";
    if (p.category) {
      const trigger = document.querySelector("#f-category-select .cs-trigger");
      if (trigger) trigger.textContent = p.category;
    }
    const tagsBox = $("f-tags");
    tagsBox.innerHTML = (p.tags || [])
      .map(
        (t) =>
          `<span class="chip" data-tag="${esc(t)}">${esc(t)}<button class="chip-x" data-tag="${esc(
            t
          )}">×</button></span>`
      )
      .join("");
    $("f-draft").checked = !!p.draft;
    $("f-pinned").checked = !!p.pinned;
    const slugInput = $("f-slug");
    slugInput.value = slug;
    slugInput.readOnly = true;
    $("editor-title").textContent = "编辑文章";
    $("btn-delete").classList.remove("hidden");
  } else {
    $("f-content").value = helloTemplate();
    $("f-date").value = nowInput();
  }
  const tagsInput = $("f-tag-input");
  if (tagsInput) tagsInput.value = "";
  updatePreview();
  openModalSafe("editor-modal");
}

function parsePostFileLocal(file) {
  const m = String(file).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const fm = m ? parseFront(m[1]) : {};
  const body = m ? m[2] : String(file);
  // Support both `category: foo` and `categories: [foo, bar]`. Use the first
  // entry if it's a list. Many existing posts use the plural form.
  const rawCat = fm.category ?? fm.categories;
  let category = "";
  if (Array.isArray(rawCat)) category = rawCat[0] || "";
  else if (rawCat) category = String(rawCat);
  const rawTags = fm.tags || [];
  const tags = Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [];
  return {
    title: fm.title || "",
    date: fm.date || "",
    category,
    tags,
    draft: !!fm.draft,
    pinned: !!fm.pinned,
    excerpt: fm.excerpt || "",
    content: body,
  };
}

function parseFront(text) {
  return parseConfigYaml(text);
}

function closeEditor() {
  closeModalSafe("editor-modal");
}

async function savePost() {
  let form;
  try {
    form = readForm();
  } catch {
    return;
  }
  try {
    const isNew = !state.editingSlug;
    await apiSavePost(form.slug, form.yaml, isNew);
    toast("已保存", "ok");
    closeEditor();
    loadPosts();
  } catch (e) {
    toast("保存失败：" + e.message, "err");
  }
}

async function deletePost() {
  if (!state.editingSlug) return;
  if (!confirm("确定删除这篇文章？")) return;
  try {
    await apiDeletePost(state.editingSlug);
    toast("已删除", "ok");
    closeEditor();
    loadPosts();
  } catch (e) {
    toast("删除失败：" + e.message, "err");
  }
}

async function copyPost(slug) {
  try {
    const result = await getPost(slug);
    const p = parsePostFileLocal(result.raw);
    navigator.clipboard
      .writeText(p.content || "")
      .then(
        () => toast("已复制正文", "ok"),
        () => toast("复制失败（浏览器限制）", "err")
      );
  } catch (e) {
    toast("复制失败：" + e.message, "err");
  }
}

async function loadPosts() {
  const tbody = $("posts-body");
  if (tbody) tbody.innerHTML = renderSkeleton();
  try {
    const posts = await getPosts();
    state.allPosts = posts;
    renderPosts(posts);
    await loadTagCloud();
    await loadCategories();
  } catch (e) {
    if (tbody)
      tbody.innerHTML = `<tr><td colspan="6" class="hint">
        加载失败<br><small>${esc(e.message)}</small>
        <br><button class="btn btn-sm retry-btn">重试</button>
      </td></tr>`;
    // Bind retry directly (only one button exists after this replace)
    const retry = tbody.querySelector(".retry-btn");
    if (retry) retry.addEventListener("click", loadPosts);
  }
}

function renderSkeleton() {
  const widths = [60, 45, 75, 55, 40];
  let html = "";
  for (let i = 0; i < 5; i++) {
    html += `<tr class="skeleton-row">`;
    for (let j = 0; j < 6; j++) {
      if (j < 5) {
        html += `<td><span class="skeleton-block" style="width:${widths[j]}%"></span></td>`;
      } else {
        html += `<td></td>`; // actions column
      }
    }
    html += `</tr>`;
  }
  return html;
}

function renderPosts(posts) {
  const tbody = $("posts-body");
  if (!tbody) return;
  const cfg = state.cfg || {};
  const q = ($("post-search")?.value || "").toLowerCase();
  const rows = posts
    .filter(
      (p) =>
        !q ||
        (p.title || "").toLowerCase().includes(q) ||
        (p.tags || []).join(" ").toLowerCase().includes(q)
    )
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="hint">没有文章</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((p) => {
      const status = p.draft
        ? `<span class="badge badge-draft">草稿</span>`
        : `<span class="badge">已发布</span>`;
      const cat = (cfg.categories?.order || []).includes(p.category)
        ? p.category
        : p.category || "—";
      return `<tr>
      <td>${esc(p.title || p.slug)}</td>
      <td>${esc(cat)}</td>
      <td>${esc((p.tags || []).join(", "))}</td>
      <td>${esc((p.date || "").slice(0, 10))}</td>
      <td>${status}</td>
      <td class="row-actions">
        <button class="btn btn-sm" data-edit="${esc(p.slug)}">编辑</button>
        <button class="btn btn-sm" data-copy="${esc(p.slug)}">复制</button>
        <button class="btn btn-sm btn-danger" data-delete="${esc(p.slug)}">删除</button>
      </td>
    </tr>`;
    })
    .join("");
}

async function loadTagCloud() {
  const cfg = await getConfigStructured();
  const names = getAllTags();
  state.tagCloud = names.map(
    (n) => ({ name: n, color: (state.tagColors || {})[n] || "#888888" })
  );
  const box = $("tags-cloud");
  if (!box) return;
  box.innerHTML = state.tagCloud
    .map(
      (t) =>
        `<button class="chip" data-tag="${esc(t.name)}" style="--c:${esc(
          t.color
        )}">${esc(t.name)}</button>`
    )
    .join("");
  state.allTagNames = names;
  renderTagCloud(state.tagCloud);
  renderTagColorsPanel();
}

function renderTagCloud(cloud) {
  const box = $("tags-cloud");
  if (!box) return;
  box.innerHTML = (cloud || [])
    .map(
      (t) =>
        `<button class="chip" data-tag="${esc(t.name)}" style="--c:${esc(
          t.color
        )}">${esc(t.name)}</button>`
    )
    .join("");
}

function loadTagPosts(tag) {
  const posts = (state.allPosts || []).filter((p) => (p.tags || []).includes(tag));
  const box = $("tags-posts");
  if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="tags-posts-head">
      <button class="btn btn-sm tags-back-btn">← 返回标签云</button>
      <h3>${esc(tag)} <span class="tags-count-badge">${posts.length}</span></h3>
    </div>` +
    (posts.length
      ? `<ul class="post-list">` +
        posts
          .map(
            (p) =>
              `<li><a data-edit="${esc(p.slug)}">${esc(
                p.title || p.slug
              )}</a></li>`
          )
          .join("") +
        `</ul>`
      : `<div class="hint">该标签下暂无文章</div>`);
  // Bind back button
  const back = box.querySelector(".tags-back-btn");
  if (back) {
    back.addEventListener("click", () => {
      box.classList.add("hidden");
      document.getElementById("tags-cloud")?.scrollIntoView({ behavior: "smooth" });
    });
  }
}

function renderTagPosts(posts) {
  const box = $("tags-posts");
  if (!box) return;
  const tag = box.dataset.tag || "";
  box.classList.remove("hidden");
  box.innerHTML =
    `<h3>${esc(tag)} (${posts.length})</h3>` +
    (posts.length
      ? `<ul class="post-list">` +
        posts
          .map(
            (p) =>
              `<li><a data-edit="${esc(p.slug)}">${esc(
                p.title || p.slug
              )}</a></li>`
          )
          .join("") +
        `</ul>`
      : `<div class="hint">该标签下暂无文章</div>`);
}

function tagSuggest(q) {
  const box = $("tag-suggest");
  if (!box) return;
  q = (q || "").trim().toLowerCase();
  if (!q) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  const names = state.allTagNames || [];
  const matches = names.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.innerHTML = matches
    .map((n) => `<div class="suggest-item" data-tag="${esc(n)}">${esc(n)}</div>`)
    .join("");
  box.classList.remove("hidden");
}

function addTag(tag) {
  tag = (tag || "").trim();
  if (!tag) return;
  const box = $("f-tags");
  if (!box) return;
  if ([...box.querySelectorAll(".chip")].some((c) => c.dataset.tag === tag))
    return;
  const el = document.createElement("span");
  el.className = "chip";
  el.dataset.tag = tag;
  el.innerHTML = `${esc(tag)}<button class="chip-x" data-tag="${esc(
    tag
  )}">×</button>`;
  box.appendChild(el);
}

async function loadCategories() {
  const cfg = await getConfigStructured();
  // Build the master category list from multiple sources so the panel is
  // never empty as long as the user has any categories defined anywhere
  // (config.yml, posts, or categorySlugs).
  const set = new Set();
  if (cfg.categories && Array.isArray(cfg.categories.order)) {
    for (const c of cfg.categories.order) if (c) set.add(c);
  }
  if (cfg.categorySlugs && typeof cfg.categorySlugs === "object") {
    for (const c of Object.keys(cfg.categorySlugs)) if (c) set.add(c);
  }
  for (const p of state.allPosts || []) {
    if (p.category) set.add(p.category);
    if (Array.isArray(p.categories)) for (const c of p.categories) if (c) set.add(c);
  }
  const cats = [...set].sort();
  state.categories = cats;
  renderCategoryList(cats);
  renderCategoryColorsPanel();
}

function renderCategoryList(cats) {
  const box = $("categories-list");
  if (!box) return;
  if (!cats.length) {
    box.innerHTML = `<div class="hint">暂无分类（在配置中设置 categories.order）</div>`;
    return;
  }
  const countMap = {};
  for (const p of state.allPosts || []) {
    const cat = p.category || "";
    if (cat) countMap[cat] = (countMap[cat] || 0) + 1;
  }
  box.innerHTML = cats
    .map(
      (c) => `<div class="cat-item">
        <span class="cat-item-name">${esc(c)}</span>
        <span class="cat-item-count">${countMap[c] || 0}</span>
      </div>`
    )
    .join("");
}

function openModalSafe(id) {
  const e = $(id);
  if (e) e.classList.remove("hidden");
}
function closeModalSafe(id) {
  const e = $(id);
  if (e) e.classList.add("hidden");
}

export {
  openEditor,
  savePost,
  deletePost,
  copyPost,
  loadPosts,
  loadTagCloud,
  loadTagPosts,
  tagSuggest,
  addTag,
  loadCategories,
};
