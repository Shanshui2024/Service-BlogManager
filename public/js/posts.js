// posts.js — Post management

// ─── Post List ───

async function loadPosts() {
  document.getElementById('posts-loading').classList.remove('hidden');
  document.getElementById('posts-table').classList.add('hidden');
  document.getElementById('posts-empty').classList.add('hidden');

  try {
    const posts = await getPosts();
    state.allPosts = posts;
    document.getElementById('post-count-badge').textContent = posts.length;
    renderPosts(posts);
  } catch (err) {
    document.getElementById('posts-loading').textContent = `加载失败: ${err.message}`;
  }
}

function renderPosts(posts) {
  document.getElementById('posts-loading').classList.add('hidden');

  if (!posts || posts.length === 0) {
    document.getElementById('posts-empty').classList.remove('hidden');
    return;
  }

  const tbody = document.getElementById('posts-tbody');
  const filter = (document.getElementById('post-search')?.value || '').toLowerCase();

  const filtered = filter
    ? posts.filter(p =>
        (p.title || '').toLowerCase().includes(filter) ||
        (p.excerpt || '').toLowerCase().includes(filter) ||
        (p.category || '').toLowerCase().includes(filter) ||
        (p.tags || []).some(t => t.toLowerCase().includes(filter))
      )
    : posts;

  tbody.innerHTML = '';

  for (const post of filtered) {
    const tr = document.createElement('tr');

    // Title
    const tdTitle = document.createElement('td');
    const titleSpan = document.createElement('span');
    titleSpan.className = `post-title-link${post.draft ? ' draft' : ''}`;
    titleSpan.textContent = post.title || post.slug;
    titleSpan.onclick = () => openEditor(post.slug);
    tdTitle.appendChild(titleSpan);

    if (post.pinned) {
      const pinBadge = document.createElement('span');
      pinBadge.className = 'post-pinned';
      pinBadge.textContent = 'PINNED';
      tdTitle.appendChild(pinBadge);
    }

    // Tags preview
    if (post.tags && post.tags.length > 0) {
      const tagsWrap = document.createElement('div');
      tagsWrap.style.marginTop = '2px';
      post.tags.slice(0, 3).forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = t;
        tagsWrap.appendChild(chip);
      });
      tdTitle.appendChild(tagsWrap);
    }

    tr.appendChild(tdTitle);

    // Category
    const tdCat = document.createElement('td');
    tdCat.textContent = post.category || '—';
    tdCat.style.color = 'var(--mono-secondary)';
    tdCat.style.fontSize = '0.8125rem';
    tr.appendChild(tdCat);

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDate(post.date);
    tdDate.style.fontFamily = 'var(--font-mono)';
    tdDate.style.fontSize = '0.75rem';
    tdDate.style.color = 'var(--mono-muted)';
    tr.appendChild(tdDate);

    // Status
    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = post.draft ? 'status-badge draft-badge' : 'status-badge published';
    badge.textContent = post.draft ? 'DRAFT' : 'PUB';
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    // Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost';
    editBtn.textContent = '编辑';
    editBtn.onclick = () => openEditor(post.slug);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-ghost';
    copyBtn.textContent = '复制';
    copyBtn.onclick = () => copyPost(post.slug);
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost btn-danger';
    delBtn.textContent = '删除';
    delBtn.onclick = () => deletePostConfirm(post.slug, post.title);
    tdActions.appendChild(editBtn);
    tdActions.appendChild(copyBtn);
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }

  document.getElementById('posts-table').classList.remove('hidden');
}

async function deletePostConfirm(slug, title) {
  if (!confirm(`确定删除"${title || slug}"? 此操作需提交后才能生效。`)) return;
  try {
    await deletePost(slug);
    toast('文章已删除 (尚未提交)', 'success');
    updateCommitIndicator();
    await loadPosts();
  } catch (err) {
    toast(`删除失败: ${err.message}`, 'error');
  }
}

async function copyPost(slug) {
  try {
    const post = await getPost(slug);
    const newSlug = slug + '-copy';
    post.slug = newSlug;
    state.selectedPost = post;
    fillEditor(post.frontmatter, post.body, newSlug, post.format);
    toast('已复制文章，请编辑后保存', 'info');
  } catch (err) {
    toast(`复制失败: ${err.message}`, 'error');
  }
}

// ─── Editor ───

async function openEditor(slug) {
  state.editorTags = [];

  if (slug) {
    try {
      const post = await getPost(slug);
      state.selectedPost = post;
      fillEditor(post.frontmatter, post.body, post.slug, post.format);
    } catch (err) {
      toast(`加载文章失败: ${err.message}`, 'error');
      return;
    }
  } else {
    // New post
    const title = '新文章';
    const now = nowInput();
    state.selectedPost = null;
    document.getElementById('editor-title-text').textContent = '新建文章';
    document.getElementById('edit-title').value = title;
    document.getElementById('edit-slug').value = slugifyTitle(title);
    document.getElementById('edit-date').value = now;
    document.getElementById('edit-category').value = '';
    document.getElementById('edit-excerpt').value = '';
    document.getElementById('edit-draft').checked = true;
    document.getElementById('edit-pinned').checked = false;
    document.getElementById('edit-body').value = '';
    document.getElementById('editor-delete').classList.add('hidden');
    state.editorTags = [];
    renderEditorTags();
  }

  document.getElementById('editor-modal').classList.remove('hidden');
  document.getElementById('edit-body').focus();
  updatePreview();
}

function fillEditor(fm, body, slug, format) {
  document.getElementById('editor-title-text').textContent = '编辑文章';
  document.getElementById('edit-title').value = fm.title || '';
  document.getElementById('edit-slug').value = slug || '';
  document.getElementById('edit-date').value = dateToInput(fm.date) || nowInput();
  document.getElementById('edit-category').value = fm.category || '';
  document.getElementById('edit-excerpt').value = fm.excerpt || '';
  document.getElementById('edit-draft').checked = fm.draft !== false;
  document.getElementById('edit-pinned').checked = !!fm.pinned;
  document.getElementById('edit-body').value = body || '';
  document.getElementById('editor-delete').classList.remove('hidden');

  // Tags
  const tags = Array.isArray(fm.tags) ? fm.tags
    : typeof fm.tags === 'string' ? fm.tags.split(',').map(t => t.trim()).filter(Boolean)
    : [];
  state.editorTags = [...tags];
  renderEditorTags();
}

function closeEditor() {
  document.getElementById('editor-modal').classList.add('hidden');
  state.selectedPost = null;
  state.editorTags = [];
}

async function saveEditorPost() {
  const title = document.getElementById('edit-title').value.trim();
  const slug = document.getElementById('edit-slug').value.trim();
  const dateVal = document.getElementById('edit-date').value;
  const category = document.getElementById('edit-category').value.trim();
  const excerpt = document.getElementById('edit-excerpt').value.trim();
  const draft = document.getElementById('edit-draft').checked;
  const pinned = document.getElementById('edit-pinned').checked;
  const body = document.getElementById('edit-body').value;

  if (!title) { toast('请输入标题', 'warning'); return; }
  if (!slug) { toast('请输入 Slug', 'warning'); return; }

  const frontmatter = {
    title,
    date: dateToYaml(dateVal),
    category: category || undefined,
    tags: state.editorTags.length > 0 ? state.editorTags : undefined,
    excerpt: excerpt || undefined,
    draft,
    pinned: pinned || undefined,
  };

  // Remove undefined values
  Object.keys(frontmatter).forEach(k => {
    if (frontmatter[k] === undefined) delete frontmatter[k];
  });

  const format = state.selectedPost?.format || 'md';

  try {
    await savePost(slug, frontmatter, body, format);
    toast('文章已保存 (尚未提交)', 'success');
    closeEditor();
    updateCommitIndicator();
    await loadPosts();
  } catch (err) {
    toast(`保存失败: ${err.message}`, 'error');
  }
}

async function deleteEditorPost() {
  const slug = document.getElementById('edit-slug').value.trim();
  const title = document.getElementById('edit-title').value.trim();
  if (!slug) return;
  if (!confirm(`确定删除"${title || slug}"?`)) return;
  try {
    await deletePost(slug);
    toast('文章已删除 (尚未提交)', 'success');
    closeEditor();
    updateCommitIndicator();
    await loadPosts();
  } catch (err) {
    toast(`删除失败: ${err.message}`, 'error');
  }
}

// ─── Editor Tags ───

function renderEditorTags() {
  const container = document.getElementById('edit-tags-list');
  container.innerHTML = '';
  for (const tag of state.editorTags) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${esc(tag)} <span class="chip-remove" data-tag="${esc(tag)}">&times;</span>`;
    chip.querySelector('.chip-remove').onclick = () => {
      state.editorTags = state.editorTags.filter(t => t !== tag);
      renderEditorTags();
    };
    container.appendChild(chip);
  }
}

// ─── Slug Auto-fill ───

let slugAutoFilled = true;
function handleTitleChange() {
  if (!slugAutoFilled) return;
  const title = document.getElementById('edit-title').value;
  document.getElementById('edit-slug').value = slugifyTitle(title);
}
function handleSlugChange() {
  slugAutoFilled = false;
}

// ─── Preview ───

function updatePreview() {
  const text = document.getElementById('edit-body')?.value || '';
  document.getElementById('edit-preview').innerHTML = mdPreview(text);
}

// ─── Tags View ───

async function loadTags() {
  try {
    const data = await getAggregate();
    state.tags = data.tags || [];
    renderTags();
  } catch (err) {
    document.getElementById('tags-list').innerHTML = `<p class="text-muted">加载失败: ${err.message}</p>`;
  }
}

function renderTags() {
  const container = document.getElementById('tags-list');
  if (!state.tags || state.tags.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无标签</p></div>';
    return;
  }
  container.innerHTML = '';
  for (const tag of state.tags) {
    const card = document.createElement('div');
    card.className = 'tag-card';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'color-input';
    colorPicker.value = '#000000';
    colorPicker.title = '标签颜色';
    card.appendChild(colorPicker);

    const info = document.createElement('div');
    info.className = 'tag-card-info';
    info.innerHTML = `<div class="tag-card-name">${esc(tag.name)}</div><div class="tag-card-count">${tag.count} 篇文章</div>`;
    card.appendChild(info);

    container.appendChild(card);
  }
}

// ─── Categories View ───

async function loadCategories() {
  try {
    const data = await getAggregate();
    state.categories = data.categories || [];
    renderCategories();
  } catch (err) {
    document.getElementById('categories-list').innerHTML = `<p class="text-muted">加载失败: ${err.message}</p>`;
  }
}

function renderCategories() {
  const container = document.getElementById('categories-list');
  if (!state.categories || state.categories.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>暂无分类</p></div>';
    return;
  }
  container.innerHTML = '';
  for (const cat of state.categories) {
    const card = document.createElement('div');
    card.className = 'tag-card';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'color-input';
    colorPicker.value = '#000000';
    card.appendChild(colorPicker);

    const info = document.createElement('div');
    info.className = 'tag-card-info';
    info.innerHTML = `<div class="tag-card-name">${esc(cat.name)}</div><div class="tag-card-count">${cat.count} 篇文章</div>`;
    card.appendChild(info);

    container.appendChild(card);
  }
}

// ─── Commit Indicator ───

async function updateCommitIndicator() {
  if (!state.repoConfigured) return;
  try {
    const status = await getRepoStatus();
    state.modifiedFiles = status.modifiedFiles || [];
    const btn = document.getElementById('commit-btn');
    const count = document.getElementById('commit-count');

    if (state.modifiedFiles.length > 0 || (status.status && !status.status.isClean)) {
      btn.classList.remove('hidden');
      const total = state.modifiedFiles.length || (
        (status.status?.modified?.length || 0) +
        (status.status?.created?.length || 0) +
        (status.status?.deleted?.length || 0)
      );
      count.textContent = total > 0 ? `${total} 个更改` : '有更改';
      btn.style.borderColor = 'var(--mono-warning)';
      btn.style.color = 'var(--mono-warning)';
    } else {
      btn.classList.add('hidden');
    }
  } catch { /* ignore */ }
}

// ─── Commit Modal ───

async function openCommitModal() {
  try {
    const status = await getRepoStatus();
    const filesDiv = document.getElementById('commit-files-list');
    let html = '';

    if (status.status) {
      const st = status.status;
      for (const f of (st.created || [])) html += `<div class="commit-file"><span class="diff-tag" style="color:var(--mono-success)">A</span> ${esc(f)}</div>`;
      for (const f of (st.modified || [])) html += `<div class="commit-file"><span class="diff-tag" style="color:var(--mono-warning)">M</span> ${esc(f)}</div>`;
      for (const f of (st.deleted || [])) html += `<div class="commit-file"><span class="diff-tag" style="color:var(--mono-danger)">D</span> ${esc(f)}</div>`;
    }

    for (const f of (status.modifiedFiles || [])) {
      if (!html.includes(esc(f))) {
        html += `<div class="commit-file"><span class="diff-tag" style="color:var(--mono-warning)">M</span> ${esc(f)}</div>`;
      }
    }

    if (!html) {
      html = '<p class="text-muted">没有需要提交的更改</p>';
    }

    filesDiv.innerHTML = html;
    document.getElementById('commit-modal').classList.remove('hidden');
  } catch (err) {
    toast(`获取状态失败: ${err.message}`, 'error');
  }
}

function closeCommitModal() {
  document.getElementById('commit-modal').classList.add('hidden');
}

async function confirmCommit() {
  const message = document.getElementById('commit-message').value.trim() || 'Update via BlogManager';
  try {
    const result = await commitAll(message);
    closeCommitModal();
    if (result.committed) {
      toast(`已提交并推送! (${result.summary?.modified || 0} 修改, ${result.summary?.created || 0} 新增, ${result.summary?.deleted || 0} 删除)`, 'success');
    } else {
      toast(result.message || '没有更改需要提交', 'info');
    }
    updateCommitIndicator();
    await loadPosts();
  } catch (err) {
    toast(`提交失败: ${err.message}`, 'error');
  }
}

// ─── Tag Editor Input ───

function setupTagInput() {
  const input = document.getElementById('edit-tag-input');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = input.value.trim().replace(/,/g, '');
      if (tag && !state.editorTags.includes(tag)) {
        state.editorTags.push(tag);
        renderEditorTags();
      }
      input.value = '';
    }
  });
}

// ─── Datalist suggestions ───

async function updateSuggestions() {
  try {
    const data = await getAggregate();
    const tagDL = document.getElementById('tag-suggestions');
    const catDL = document.getElementById('category-suggestions');
    if (tagDL) tagDL.innerHTML = (data.tags || []).map(t => `<option value="${esc(t.name)}">`).join('');
    if (catDL) catDL.innerHTML = (data.categories || []).map(c => `<option value="${esc(c.name)}">`).join('');
  } catch { /* ignore */ }
}

window.loadPosts = loadPosts;
window.openEditor = openEditor;
window.closeEditor = closeEditor;
window.saveEditorPost = saveEditorPost;
window.deleteEditorPost = deleteEditorPost;
window.handleTitleChange = handleTitleChange;
window.handleSlugChange = handleSlugChange;
window.updatePreview = updatePreview;
window.copyPost = copyPost;
window.loadTags = loadTags;
window.loadCategories = loadCategories;
window.updateCommitIndicator = updateCommitIndicator;
window.openCommitModal = openCommitModal;
window.closeCommitModal = closeCommitModal;
window.confirmCommit = confirmCommit;
window.setupTagInput = setupTagInput;
window.updateSuggestions = updateSuggestions;
window.deletePostConfirm = deletePostConfirm;
