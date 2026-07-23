// github.js — GitHub REST (contents) client. All calls go through the
// same-origin /api/github proxy to avoid CORS.
import { getRepo, getBranch, getRoot } from "./storage.js";
import { parseConfigYaml } from "./yaml.js";

export const enc = (s) => encodeURIComponent(s);
// Encode each path segment but KEEP the "/" separators. Using raw enc() on a
// "owner/repo" or "dir/sub/file" string turns the slashes into %2F, which the
// proxy forwards literally to GitHub and GitHub then 404s.
export const encPath = (p) => String(p).split("/").map(enc).join("/");

export async function gh(method, path, body) {
  const headers = { "x-gh-path": path };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/github`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const m = (json && json.message) || res.statusText || "GitHub 请求失败";
    throw new Error(`${m} (${res.status})`);
  }
  return json;
}

export async function readFile(full, includeMeta = false) {
  try {
    const data = await gh(
      "GET",
      `/repos/${encPath(getRepo())}/contents/${encPath(full)}?ref=${enc(
        getBranch()
      )}`
    );
    if (!data) return null;
    if (includeMeta) {
      return {
        content: data.content ? decodeBase64(data.content) : null,
        sha: data.sha || null,
      };
    }
    return data.content ? decodeBase64(data.content) : null;
  } catch (e) {
    if (e.message && /404/.test(e.message)) return null;
    throw e;
  }
}

// Get the SHA of an existing file without decoding its content.
// Returns null if the file doesn't exist.
export async function getSha(full) {
  try {
    const data = await gh(
      "GET",
      `/repos/${encPath(getRepo())}/contents/${encPath(full)}?ref=${enc(
        getBranch()
      )}`
    );
    return data ? data.sha || null : null;
  } catch (e) {
    if (e.message && /404/.test(e.message)) return null;
    throw e;
  }
}

export async function writeFile(full, content, sha, message) {
  const body = {
    message: message || `update ${full}`,
    content: base64Encode(content),
  };
  if (sha) body.sha = sha;
  return gh(
    "PUT",
    `/repos/${encPath(getRepo())}/contents/${encPath(full)}`,
    body
  );
}

export async function deleteFile(full, sha, message) {
  return gh("DELETE", `/repos/${encPath(getRepo())}/contents/${encPath(full)}`, {
    message: message || `delete ${full}`,
    sha,
  });
}

export async function listPosts() {
  const out = [];
  async function walk(dir) {
    const suffix = dir ? `/${encPath(dir)}` : "";
    const data = await gh(
      "GET",
      `/repos/${encPath(getRepo())}/contents/${encPath(getRoot())}${suffix}?ref=${enc(
        getBranch()
      )}`
    );
    if (!Array.isArray(data)) return;
    for (const item of data) {
      if (item.type === "dir")
        await walk(dir ? `${dir}/${item.name}` : item.name);
      else if (/\.(mdx?|md)$/i.test(item.name)) {
        const full = dir ? `${dir}/${item.name}` : item.name;
        const slug = full.replace(/\.(mdx?|md)$/i, "");
        out.push({ slug, path: full, sha: item.sha, size: item.size });
      }
    }
  }
  await walk("");
  return out;
}

// BUG FIX: iterate with `slug` (no extension). The old code used the path that
// already included the extension and appended ".mdx"/".md" again, producing
// "data/posts/foo.mdx.mdx" and 404ing on GitHub.
export async function getAllPosts() {
  const list = await listPosts();
  const posts = [];
  for (const { slug } of list) {
    try {
      let r = await readFile(`${getRoot()}/${slug}.mdx`);
      if (!r) r = await readFile(`${getRoot()}/${slug}.md`);
      if (!r) continue;
      const parsed = parsePostFile(r);
      posts.push({ ...parsed, sha: list.find((x) => x.slug === slug)?.sha });
    } catch (e) {
      console.warn("读取失败", slug, e);
    }
  }
  return posts;
}

export async function getLogin() {
  const user = await gh("GET", "/user");
  return user.login;
}

export function base64Encode(s) {
  return btoa(unescape(encodeURIComponent(s)));
}
export function decodeBase64(s) {
  return decodeURIComponent(escape(atob(s)));
}

export function parsePostFile(file) {
  const m = String(file).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const fm = m ? parseConfigYaml(m[1]) : {};
  const body = m ? m[2] : String(file);
  // Support both `category: foo` and `categories: [foo, bar]`. Use the first
  // entry of the list if it's a list.
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
