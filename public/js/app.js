// app.js — Application entry point and UI orchestration

const App = {
  async boot() {
    bindEvents();
    setupTagInput();

    // Check URL for error
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      document.getElementById('login-error').textContent = decodeURIComponent(error);
    }

    // Check auth status
    const authed = await checkAuth();
    if (authed) {
      updateUI();
      await initRepo();
    } else {
      showLogin();
    }
  },

  startLogin() {
    startLogin();
  },
};

// ─── UI State ───

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function updateUI() {
  showApp();

  // User info
  if (state.arcUser) {
    document.getElementById('user-name').textContent = state.arcUser.username || 'User';
    if (state.arcUser.avatarUrl) {
      document.getElementById('user-avatar').src = state.arcUser.avatarUrl;
    }
  }

  updateThemeIcons();

  // Repo indicator
  updateRepoIndicator();

  // Navigate to default view
  navigateTo('posts');
  loadPosts();
  updateSuggestions();
}

function updateRepoIndicator() {
  const indicator = document.getElementById('repo-indicator');
  const label = document.getElementById('repo-label');
  if (state.repoConfigured) {
    indicator.classList.add('connected');
    label.textContent = `${state.repoOwner}/${state.repoName}`;
  } else {
    indicator.classList.remove('connected');
    label.textContent = '未配置';
  }
}

// ─── Repo Initialization ───

async function initRepo() {
  try {
    const status = await getRepoStatus();
    if (status.configured) {
      state.repoConfigured = true;
      state.repoOwner = status.config.owner;
      state.repoName = status.config.repo;
      state.repoBranch = status.config.branch;
      state.repoRoot = status.config.root;
      updateRepoIndicator();
      updateCommitIndicator();
    }
  } catch {
    // Repo not configured yet — that's fine
    state.repoConfigured = false;
  }
}

// ─── Navigation ───

function navigateTo(view) {
  state.currentView = view;

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Show/hide views
  const views = ['posts', 'tags', 'categories', 'config', 'settings'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });

  // Load view data
  switch (view) {
    case 'posts':
      loadPosts();
      updateSuggestions();
      break;
    case 'tags':
      loadTags();
      break;
    case 'categories':
      loadCategories();
      break;
    case 'config':
      loadConfig();
      break;
    case 'settings':
      loadSettings();
      break;
  }
}

function loadSettings() {
  document.getElementById('setting-token').value = '';
  document.getElementById('setting-owner').value = state.repoOwner || getStored(REPO_KEY, '').split('/')[0] || '';
  document.getElementById('setting-repo').value = state.repoName || getStored(REPO_KEY, '').split('/')[1] || '';
  document.getElementById('setting-branch').value = state.repoBranch || getBranch();
  document.getElementById('setting-root').value = state.repoRoot || getRoot();
}

async function saveSettings() {
  const token = document.getElementById('setting-token').value.trim();
  const owner = document.getElementById('setting-owner').value.trim();
  const repo = document.getElementById('setting-repo').value.trim();
  const branch = document.getElementById('setting-branch').value.trim() || 'main';
  const root = document.getElementById('setting-root').value.trim();

  if (!token || !owner || !repo) {
    toast('请填写 Token、仓库所有者和仓库名称', 'warning');
    return;
  }

  try {
    const result = await setupRepo(token, owner, repo, branch, root);
    saveRepoSettings(owner, repo, branch, root);
    state.repoConfigured = true;
    updateRepoIndicator();
    updateCommitIndicator();
    toast('仓库连接成功!', 'success');
    navigateTo('posts');
  } catch (err) {
    toast(`连接失败: ${err.message}`, 'error');
  }
}

async function disconnectRepo() {
  if (!confirm('确定断开仓库连接? 未提交的更改将丢失。')) return;
  // Clear server-side repo config by destroying and recreating
  try {
    // The simple approach: just clear local state
    state.repoConfigured = false;
    state.repoOwner = '';
    state.repoName = '';
    state.modifiedFiles = [];
    updateRepoIndicator();
    document.getElementById('commit-btn').classList.add('hidden');
    toast('已断开仓库连接', 'info');
    navigateTo('settings');
  } catch (err) {
    toast(`操作失败: ${err.message}`, 'error');
  }
}

// ─── Event Bindings ───

function bindEvents() {
  // Sidebar toggle
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.view);
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('确定登出?')) logout();
  });

  // Post search
  const searchInput = document.getElementById('post-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderPosts(state.allPosts);
    });
  }

  // New post
  document.getElementById('new-post-btn').addEventListener('click', () => openEditor(null));

  // Editor
  document.getElementById('editor-close').addEventListener('click', closeEditor);
  document.getElementById('editor-cancel').addEventListener('click', closeEditor);
  document.getElementById('editor-save').addEventListener('click', saveEditorPost);
  document.getElementById('editor-delete').addEventListener('click', deleteEditorPost);
  document.getElementById('edit-title').addEventListener('input', handleTitleChange);
  document.getElementById('edit-slug').addEventListener('input', handleSlugChange);
  document.getElementById('edit-body').addEventListener('input', updatePreview);

  // Editor tabs
  document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.tab;
      document.getElementById('edit-body').classList.toggle('hidden', mode !== 'write');
      document.getElementById('edit-preview').classList.toggle('hidden', mode !== 'preview');
      if (mode === 'preview') updatePreview();
    });
  });

  // Config save
  document.getElementById('save-config-btn').addEventListener('click', saveConfigChanges);

  // Settings
  document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
  document.getElementById('settings-disconnect-btn').addEventListener('click', disconnectRepo);

  // Commit
  document.getElementById('commit-btn').addEventListener('click', openCommitModal);
  document.getElementById('commit-modal-close').addEventListener('click', closeCommitModal);
  document.getElementById('commit-modal-cancel').addEventListener('click', closeCommitModal);
  document.getElementById('commit-modal-confirm').addEventListener('click', confirmCommit);

  // Modal overlay close
  document.getElementById('editor-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditor();
  });
  document.getElementById('commit-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCommitModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!document.getElementById('editor-modal').classList.contains('hidden')) {
        closeEditor();
      } else if (!document.getElementById('commit-modal').classList.contains('hidden')) {
        closeCommitModal();
      }
    }
    // Ctrl+S to save in editor
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (!document.getElementById('editor-modal').classList.contains('hidden')) {
        e.preventDefault();
        saveEditorPost();
      }
    }
  });

  // New tag btn
  document.getElementById('new-tag-btn')?.addEventListener('click', () => {
    const name = prompt('输入标签名:');
    if (name && name.trim()) {
      toast('标签将通过文章 frontmatter 添加。请在编辑文章时使用标签输入框。', 'info');
    }
  });

  // New category btn
  document.getElementById('new-category-btn')?.addEventListener('click', () => {
    const name = prompt('输入分类名:');
    if (name && name.trim()) {
      toast('分类将通过文章 frontmatter 添加。请在编辑文章时设置分类字段。', 'info');
    }
  });
}

// ─── Boot ───

document.addEventListener('DOMContentLoaded', () => App.boot());

window.App = App;
window.navigateTo = navigateTo;
