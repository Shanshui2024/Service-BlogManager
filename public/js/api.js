// api.js — Clean API client for the BlogManager backend
// Replaces the old github.js proxy. All repo operations go through local git clone on server.
import { getRepo, getBranch, getRoot } from './storage.js';

const BASE = '';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token expired — trigger re-login
    window.dispatchEvent(new CustomEvent('auth-expired'));
    throw new Error('Authentication expired. Please log in again.');
  }

  const data = await res.json().catch(() => ({ error: res.statusText }));

  if (!res.ok) {
    throw new Error(data.error || `Server error: ${res.status}`);
  }

  return data;
}

function repoParams() {
  const full = getRepo(); // "owner/repo"
  const [owner, repo] = full.split('/');
  return { owner, repo, branch: getBranch(), root: getRoot() };
}

/** Clone/pull the repository on the server */
export async function setupRepo() {
  return request('/api/repo/setup', {
    method: 'POST',
    body: JSON.stringify(repoParams()),
  });
}

/** List all posts with their frontmatter */
export async function getPosts() {
  const params = repoParams();
  const qs = new URLSearchParams(params).toString();
  return request(`/api/posts?${qs}`);
}

/** Read a single post (raw content + parsed frontmatter) */
export async function getPost(slug) {
  const params = repoParams();
  const qs = new URLSearchParams({ ...params, slug }).toString();
  return request(`/api/posts/${encodeURIComponent(slug)}?${qs}`);
}

/** Create or update a post. `isNew` adds a "new:" prefix to the commit message. */
export async function savePost(slug, content, isNew) {
  const params = repoParams();
  return request(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...params,
      content,
      message: isNew ? `new: ${slug}` : `update: ${slug}`,
    }),
  });
}

/** Delete a post */
export async function deletePost(slug) {
  const params = repoParams();
  return request(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      ...params,
      message: `delete: ${slug}`,
    }),
  });
}

/** Read config.yml (raw + parsed) */
export async function getConfig() {
  const params = repoParams();
  const qs = new URLSearchParams({
    owner: params.owner,
    repo: params.repo,
    branch: params.branch,
  }).toString();
  return request(`/api/config?${qs}`);
}

/** Update config.yml */
export async function saveConfig(content) {
  const params = repoParams();
  return request('/api/config', {
    method: 'PUT',
    body: JSON.stringify({
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      content,
      message: 'update config.yml',
    }),
  });
}

/** Search posts (full-text, server-side) */
export async function searchPosts(query) {
  const params = repoParams();
  const qs = new URLSearchParams({ ...params, q: query }).toString();
  return request(`/api/search?${qs}`);
}

/** Get authenticated GitHub user info */
export async function getUser() {
  return request('/api/github/user');
}
