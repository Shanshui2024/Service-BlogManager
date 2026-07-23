// ui.js — small DOM/string helpers, toasts, and pure UI renderers.
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function cssEsc(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, "\\$&");
}

export function toast(msg, kind = "info") {
  const box = document.getElementById("toast-box");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast toast-" + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

export function nowInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function dateToInput(d) {
  if (typeof d === "string") d = new Date(d);
  if (isNaN(d)) return nowInput();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export function dateToYaml(d) {
  if (typeof d === "string") d = new Date(d);
  if (isNaN(d)) d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function slugifyTitle(t) {
  return String(t || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function setEditorStatus(msg, kind = "info") {
  const el = document.getElementById("editor-status");
  if (el) {
    el.textContent = msg || "";
    el.className = "status" + (kind !== "info" ? " status-" + kind : "");
  }
}

export function updatePreview() {
  const ta = document.getElementById("f-content");
  const pv = document.getElementById("preview");
  if (!ta || !pv) return;
  const src = ta.value || "";
  if (window.marked && window.marked.parse) {
    try {
      pv.innerHTML = window.marked.parse(src);
    } catch {
      pv.textContent = src;
    }
  } else {
    pv.textContent = src;
  }
}

export function helloTemplate() {
  return `# 你好\n\n这是一篇示例文章。\n\n- 支持 Markdown\n- 支持标签与分类\n\n> 写于 ${dateToYaml(
    new Date()
  )}\n`;
}

export function indexObj(arr, key) {
  const o = {};
  for (const it of arr || []) o[it[key]] = it;
  return o;
}

export function colorToHex(s) {
  if (!s) return "#888888";
  const c = s.trim();
  if (c.startsWith("#")) return c;
  const m = c.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (m) {
    const h = (n) => Number(n).toString(16).padStart(2, "0");
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  }
  return "#888888";
}

export function rowHtml(label, value) {
  const v = value == null ? "" : value;
  return `<div class="cfg-row"><span class="cfg-label">${esc(
    label
  )}</span><input class="input cfg-input" data-cfg="${esc(label)}" value="${esc(
    v
  )}" /></div>`;
}

export function renderRows(container, rows) {
  if (!container) return;
  container.innerHTML = rows.map((r) => rowHtml(r.label, r.value)).join("");
}

export function gatherRows(form) {
  const out = {};
  if (!form) return out;
  form.querySelectorAll("[data-cfg]").forEach((el) => {
    out[el.getAttribute("data-cfg")] = el.value;
  });
  return out;
}

export function bindConfigAddButtons(pane, list) {
  if (!pane || !list) return;
  pane.onclick = (e) => {
    if (e.target.classList.contains("cfg-add")) {
      const label = prompt("新字段名：");
      if (!label) return;
      list.push({ label, value: "" });
      renderRows(pane, list);
    }
  };
}
