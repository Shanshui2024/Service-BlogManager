// api.js — API client for backend communication

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    state.authed = false;
    state.arcUser = null;
    showLogin();
    throw new Error('Authentication expired');
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ─── Repo ───

async function setupRepo(token, owner, repo, branch, root) {
  return request('/api/repo/setup', {
    method: 'POST',
    body: JSON.stringify({ token, owner, repo, branch, root }),
  });
}

async function getRepoStatus() {
  return request('/api/repo/status');
}

// ─── Posts ───

async function getPosts() {
  return request('/api/posts');
}

async function getPost(slug) {
  return request(`/api/posts/${encodeURIComponent(slug)}`);
}

async function savePost(slug, frontmatter, body, format = 'md') {
  return request(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify({ frontmatter, body, format }),
  });
}

async function deletePost(slug) {
  return request(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

// ─── Config ───

async function getConfig() {
  return request('/api/config');
}

async function saveConfig(content) {
  return request('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

// ─── Search ───

async function searchPosts(q) {
  return request(`/api/search?q=${encodeURIComponent(q)}`);
}

// ─── Aggregation ───

async function getAggregate() {
  return request('/api/aggregate');
}

// ─── Commit ───

async function commitAll(message) {
  return request('/api/commit', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

window.request = request;
window.setupRepo = setupRepo;
window.getRepoStatus = getRepoStatus;
window.getPosts = getPosts;
window.getPost = getPost;
window.savePost = savePost;
window.deletePost = deletePost;
window.getConfig = getConfig;
window.saveConfig = saveConfig;
window.searchPosts = searchPosts;
window.getAggregate = getAggregate;
window.commitAll = commitAll;
