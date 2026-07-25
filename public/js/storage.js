// storage.js — State and localStorage management

const REPO_KEY = 'bm_repo';
const BRANCH_KEY = 'bm_branch';
const ROOT_KEY = 'bm_root';

// Global application state
const state = {
  authed: false,
  arcUser: null,
  repoConfigured: false,
  repoOwner: '',
  repoName: '',
  repoBranch: 'main',
  repoRoot: '',
  selectedPost: null,
  allPosts: [],
  tags: [],
  categories: [],
  configRaw: '',
  configParsed: null,
  modifiedFiles: [],
  currentView: 'posts',
  editorTags: [],
};

function getStored(key, fallback = '') {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function setStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function getRepo() { return getStored(REPO_KEY); }
function getBranch() { return getStored(BRANCH_KEY, 'main'); }
function getRoot() { return getStored(ROOT_KEY); }

function setRepo(v) { setStored(REPO_KEY, v); }
function setBranch(v) { setStored(BRANCH_KEY, v); }
function setRoot(v) { setStored(ROOT_KEY, v); }

function saveRepoSettings(owner, repo, branch, root) {
  setStored(REPO_KEY, `${owner}/${repo}`);
  setStored(BRANCH_KEY, branch);
  setStored(ROOT_KEY, root);
  state.repoOwner = owner;
  state.repoName = repo;
  state.repoBranch = branch;
  state.repoRoot = root;
}

window.state = state;
