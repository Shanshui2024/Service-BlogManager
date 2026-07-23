// storage.js — localStorage keys, getters, and shared in-memory state.
// Token is now stored server-side in session.  Client only stores repo config.
export const REPO_KEY = "sw_gh_repo";
export const BRANCH_KEY = "sw_gh_branch";
export const ROOT_KEY = "sw_gh_root";

export function getRepo() {
  const r = localStorage.getItem(REPO_KEY);
  return r && r.trim() ? r.trim() : "Shanshui2024/Site-BlogRepo";
}
export function getBranch() {
  const b = localStorage.getItem(BRANCH_KEY);
  return (b && b.trim() ? b.trim() : "v2");
}
export function getRoot() {
  const r = localStorage.getItem(ROOT_KEY);
  return (r && r.trim() ? r.trim() : "data/posts").replace(/^\/+|\/+$/g, "");
}

// Shared, mutable, app-wide state.
export const state = {
  allPosts: [],
  tagCloud: [],
  tagPosts: {},
  categories: [],
  allTagNames: [],
  cfg: null,
  tagColors: {},
  categoryColors: {},
  editingSlug: null,
  editingSha: null,
  /** Whether the user is authenticated with GitHub (fetched from server) */
  authed: false,
  /** GitHub username */
  ghUser: null,
};
