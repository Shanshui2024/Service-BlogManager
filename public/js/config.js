// config.js — Site config management

async function loadConfig() {
  try {
    // Load YAML config
    const data = await getConfig();
    if (data.notFound) {
      safeSetText('config-loading', 'config.yml 未找到，保存后将自动创建');
      state.configRaw = '';
      state.configParsed = null;
      renderConfigEditor();
    } else {
      state.configRaw = data.raw;
      state.configParsed = data.parsed;
      renderConfigEditor();
    }

    // Load site config (tag/category colors)
    await loadSiteConfigSection();
  } catch (err) {
    document.getElementById('config-loading').textContent = `加载失败: ${err.message}`;
  }
}

function renderConfigEditor() {
  document.getElementById('config-loading').classList.remove('hidden');
  const editor = document.getElementById('config-editor');
  editor.classList.remove('hidden');
  editor.value = state.configRaw || '';
}

async function saveConfigChanges() {
  const editor = document.getElementById('config-editor');
  try {
    await saveConfig(editor.value);
    state.configRaw = editor.value;
    toast('配置已保存 (尚未提交)', 'success');
    updateCommitIndicator();
  } catch (err) {
    toast(`保存失败: ${err.message}`, 'error');
  }
}

// ─── Site Config (tag/category colors) ───

async function loadSiteConfigSection() {
  try {
    const config = await getSiteConfig();
    state.siteTags = config.tags || {};
    state.siteCategories = config.categories || {};
    renderColorTable('site-tags-list', state.siteTags, 'tag');
    renderColorTable('site-categories-list', state.siteCategories, 'category');
  } catch (err) {
    console.error('[SiteConfig] Load error:', err);
    state.siteTags = {};
    state.siteCategories = {};
  }
}

function renderColorTable(tableId, items, type) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  tbody.innerHTML = '';

  const entries = Object.entries(items).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, color] of entries) {
    const tr = document.createElement('tr');

    // Name
    const tdName = document.createElement('td');
    tdName.textContent = name || '';
    tdName.style.fontSize = '13px';
    tr.appendChild(tdName);

    // Color picker
    const tdColor = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color || '#cccccc';
    input.style.width = '36px';
    input.style.height = '28px';
    input.style.border = '1px solid var(--mono-border-light)';
    input.style.cursor = 'pointer';
    input.dataset.name = name;
    input.dataset.type = type;
    input.addEventListener('change', onColorChange);
    tdColor.appendChild(input);
    tr.appendChild(tdColor);

    // Preview / hex
    const tdHex = document.createElement('td');
    tdHex.textContent = color || '#cccccc';
    tdHex.style.fontFamily = 'var(--font-mono)';
    tdHex.style.fontSize = '12px';
    tdHex.style.color = 'var(--mono-muted)';
    tdHex.id = `color-label-${type}-${CSS.escape(name)}`;
    tr.appendChild(tdHex);

    // Delete
    const tdDel = document.createElement('td');
    tdDel.style.textAlign = 'right';
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-danger';
    btn.style.padding = '2px 8px';
    btn.style.fontSize = '11px';
    btn.textContent = '删除';
    btn.addEventListener('click', () => {
      if (type === 'tag') delete state.siteTags[name];
      else delete state.siteCategories[name];
      renderColorTable(tableId, type === 'tag' ? state.siteTags : state.siteCategories, type);
      autoSaveSiteConfig();
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  }
}

function onColorChange(e) {
  const { name, type } = e.target.dataset;
  const color = e.target.value;
  if (type === 'tag') state.siteTags[name] = color;
  else state.siteCategories[name] = color;

  // Update hex label
  const label = document.getElementById(`color-label-${type}-${CSS.escape(name)}`);
  if (label) label.textContent = color;

  autoSaveSiteConfig();
}

let siteConfigSaveTimer = null;
function autoSaveSiteConfig() {
  clearTimeout(siteConfigSaveTimer);
  siteConfigSaveTimer = setTimeout(async () => {
    try {
      await saveSiteConfig(state.siteTags, state.siteCategories);
      console.log('[SiteConfig] Auto-saved');
      updateCommitIndicator();
    } catch (err) {
      toast(`颜色保存失败: ${err.message}`, 'error');
    }
  }, 500);
}

function addColorItem(type) {
  const input = document.getElementById(`site-${type}-new`);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return toast('请输入名称', 'warning');

  if (type === 'tag') state.siteTags[name] = '#cccccc';
  else state.siteCategories[name] = '#cccccc';

  const tableId = type === 'tag' ? 'site-tags-list' : 'site-categories-list';
  renderColorTable(tableId, type === 'tag' ? state.siteTags : state.siteCategories, type);
  input.value = '';
  autoSaveSiteConfig();
}

window.loadConfig = loadConfig;
window.saveConfigChanges = saveConfigChanges;
window.addColorItem = addColorItem;

