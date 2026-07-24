// app.js — entry point: wires DOM events and boots the app.
import { state, getRepo, getBranch, getRoot, REPO_KEY, BRANCH_KEY, ROOT_KEY } from "./storage.js";
import { startLogin, logout, checkAuth } from "./auth.js";
import { toast, esc, slugifyTitle, updatePreview } from "./ui.js";
import {
  loadPosts,
  openEditor,
  savePost,
  deletePost,
  copyPost,
  loadTagCloud,
  loadTagPosts,
  tagSuggest,
  addTag,
  loadCategories,
} from "./posts.js";
import { loadConfig, saveConfig, getAllTags, getAllCategories } from "./config.js";
import { deletePost as apiDeletePost, setupRepo } from "./api.js";

const $ = (id) => document.getElementById(id);
function show(id, on) {
  const e = $(id);
  if (e) e.classList.toggle("hidden", !on);
}
function openModal(id) {
  show(id, true);
}
function closeModal(id) {
  show(id, false);
}

function updateUI() {
  const authed = state.authed;
  show("login-screen", !authed);
  ["btn-settings", "btn-login", "btn-logout", "btn-new"].forEach((id) =>
    show(id, authed)
  );
  const badge = $("repo-badge");
  if (badge) {
    badge.textContent = authed ? `已连接 GitHub${state.ghUser ? " · " + state.ghUser : ""}` : "";
    show("repo-badge", authed);
  }
  if (authed) {
    const view =
      document.querySelector(".nav-item.active")?.dataset.view || "posts";
    if (view === "posts") loadPosts();
    else if (view === "tags") loadTagCloud();
    else if (view === "categories") loadCategories();
    else if (view === "config") loadConfig();
  }
}

function openSettings() {
  $("s-repo").value = getRepo();
  $("s-branch").value = getBranch();
  $("s-root").value = getRoot();
}

function saveSettings() {
  const repo = $("s-repo").value.trim();
  const branch = $("s-branch").value.trim();
  const root = $("s-root").value.trim();
  if (!repo) {
    $("settings-status").textContent = "请填写仓库";
    return;
  }
  localStorage.setItem(REPO_KEY, repo);
  localStorage.setItem(BRANCH_KEY, branch || "main");
  localStorage.setItem(ROOT_KEY, root);
  $("settings-status").textContent = "已保存";
  setTimeout(() => {
    $("settings-status").textContent = "";
  }, 1500);
  loadPosts();
}

function bind() {
  $("btn-login")?.addEventListener("click", startLogin);
  $("btn-login-big")?.addEventListener("click", startLogin);
  $("btn-logout")?.addEventListener("click", async () => {
    await logout();
    toast("已退出", "ok");
    updateUI();
  });
  $("btn-new")?.addEventListener("click", () => openEditor(null));

  $("btn-save")?.addEventListener("click", savePost);
  $("btn-delete")?.addEventListener("click", deletePost);
  $("editor-close")?.addEventListener("click", () => closeModal("editor-modal"));

  $("btn-save-settings")?.addEventListener("click", saveSettings);
  $("settings-close")?.addEventListener("click", () => closeModal("settings-modal"));
  $("btn-settings")?.addEventListener("click", () => {
    openSettings();
    openModal("settings-modal");
  });

  document.querySelectorAll(".nav-item").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      const view = b.dataset.view;
      document
        .querySelectorAll(".view")
        .forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
      if (view === "posts") loadPosts();
      else if (view === "tags") loadTagCloud();
      else if (view === "categories") loadCategories();
      else if (view === "config") loadConfig();
    });
  });

  $("posts-body")?.addEventListener("click", (e) => {
    const t = e.target.closest(
      "button[data-edit],a[data-edit],button[data-copy],button[data-delete]"
    );
    if (!t) return;
    if (t.dataset.edit) openEditor(t.dataset.edit);
    else if (t.dataset.copy) copyPost(t.dataset.copy);
    else if (t.dataset.delete) {
      if (!confirm("确定删除这篇文章？")) return;
      const slug = t.dataset.delete;
      (async () => {
        try {
          await apiDeletePost(slug);
          toast("已删除", "ok");
          loadPosts();
        } catch (err) {
          toast("删除失败：" + err.message, "err");
        }
      })();
    }
  });

  $("tags-cloud")?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tag]");
    if (t) loadTagPosts(t.dataset.tag);
  });
  $("tags-posts")?.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-edit]");
    if (a) openEditor(a.dataset.edit);
  });

  const tagInput = $("f-tag-input");
  tagInput?.addEventListener("input", () => tagSuggest(tagInput.value));
  tagInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = tagInput.value.trim();
      if (v) {
        addTag(v);
        tagInput.value = "";
        $("tag-suggest").classList.add("hidden");
      }
    }
  });
  $("tag-suggest")?.addEventListener("click", (e) => {
    const it = e.target.closest("[data-tag]");
    if (it) {
      addTag(it.dataset.tag);
      tagInput.value = "";
      $("tag-suggest").classList.add("hidden");
    }
  });
  $("f-tags")?.addEventListener("click", (e) => {
    const x = e.target.closest(".chip-x");
    if (x) x.closest(".chip").remove();
  });

  $("f-content")?.addEventListener("input", updatePreview);

  $("post-search")?.addEventListener("input", () => loadPosts());

  $("btn-slug-from-title")?.addEventListener("click", () => {
    const t = $("f-title")?.value || "";
    const s = $("f-slug");
    if (s && !s.readOnly) s.value = slugifyTitle(t);
  });

  document.querySelectorAll(".cs-trigger").forEach((t) => {
    t.addEventListener("click", () => {
      const panel = t.parentElement.querySelector(".cs-panel");
      if (panel) panel.classList.toggle("hidden");
    });
  });
  document.querySelectorAll(".cs-panel").forEach((p) => {
    p.addEventListener("click", (e) => {
      const item = e.target.closest(".cs-item");
      if (!item) return;
      const trigger = p.parentElement.querySelector(".cs-trigger");
      if (trigger) trigger.textContent = item.dataset.value;
      p.classList.add("hidden");
    });
  });

  $("btn-save-config")?.addEventListener("click", saveConfig);

  document
    .querySelectorAll("#tag-select .cs-trigger, #cat-select .cs-trigger")
    .forEach((t) => {
      t.addEventListener("click", () => {
        const panel = t.parentElement.querySelector(".cs-panel");
        if (!panel) return;
        const names = t.closest("#tag-select")
          ? getAllTags()
          : getAllCategories();
        panel.innerHTML = names
          .map((n) => `<div class="cs-item" data-value="${esc(n)}">${esc(n)}</div>`)
          .join("");
        panel.classList.toggle("hidden");
      });
    });
}

async function boot() {
  bind();

  // Check auth status with server first
  await checkAuth();

  // Handle URL error params from OAuth callback
  const params = new URLSearchParams(location.search);
  if (params.has("error")) {
    toast("登录失败：" + params.get("error"), "err");
    history.replaceState(null, "", location.pathname + location.hash);
  }

  if (state.authed) {
    try {
      await setupRepo();
    } catch (e) {
      toast("仓库初始化失败：" + e.message, "err");
    }
  }

  updateUI();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot);
else boot();
