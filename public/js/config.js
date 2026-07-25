// config.js — Site config with visual form editor

// ─── YAML Manipulation Helpers ─────────────────────────────

/** Get a simple string value from YAML raw text */
function yamlGet(raw, key) {
  const re = new RegExp(`^${escapeRegex(key)}:\\s*(.+)$`, 'm');
  const m = raw.match(re);
  if (!m) return '';
  let val = m[1].trim();
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    val = val.slice(1, -1);
  }
  return val;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Set a simple string value in YAML. Returns modified raw text. */
function yamlSet(raw, key, value) {
  const re = new RegExp(`^${escapeRegex(key)}:\\s*.+$`, 'm');
  if (re.test(raw)) {
    return raw.replace(re, `${key}: ${value}`);
  }
  // Append at end
  return raw.trimEnd() + '\n' + `${key}: ${value}` + '\n';
}

/** Get a YAML map block (e.g. tag_colors) from raw text */
function yamlGetMap(raw, key) {
  const re = new RegExp(`^${escapeRegex(key)}:\\s*\\n((?:  .+\\n?)*)`, 'm');
  const m = raw.match(re);
  if (!m) return {};
  const result = {};
  const lines = m[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^  (\\S[^:]*):\\s*(.+)$/);
    if (kv) {
      result[kv[1].trim()] = kv[2].trim();
    }
  }
  return result;
}

/** Set a YAML map block in raw text */
function yamlSetMap(raw, key, entries) {
  const sorted = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
  if (sorted.length === 0) {
    // Remove the block
    const re = new RegExp(`^${escapeRegex(key)}:\\s*\\n(?:  .+\\n?)*`, 'm');
    if (re.test(raw)) {
      return raw.replace(re, '').replace(/\n{3,}/g, '\n\n');
    }
    return raw;
  }
  const lines = sorted.map(([k, v]) => `  ${k}: ${v}`);
  const block = `${key}:\n${lines.join('\n')}\n`;

  const re = new RegExp(`^${escapeRegex(key)}:\\s*\\n(?:  .+\\n?)*`, 'm');
  if (re.test(raw)) {
    return raw.replace(re, block);
  }
  return raw.trimEnd() + '\n' + block;
}

/** Lightweight YAML parser for known flat keys + 1-level maps */
function parseYamlLite(raw) {
  const result = {};
  if (!raw) return result;

  const lines = raw.split('\n');
  let inMap = null;
  let mapKey = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // End of map section
    if (inMap && !line.startsWith('  ') && line.trim() !== '') {
      inMap = null;
      mapKey = null;
    }

    // Simple key: value
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (kv && !inMap) {
      const key = kv[1];
      let value = kv[2].trim();

      // Check if next line starts a map block
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.match(/^  \S/)) {
        inMap = true;
        mapKey = key;
        result[key] = {};
        continue;
      }

      if (value === '' || value === '~') result[key] = '';
      else result[key] = value;
      continue;
    }

    // Map entry: "  name: value"
    if (inMap) {
      const m = line.match(/^  (\S[^:]*):\s*(.*)$/);
      if (m) {
        result[mapKey][m[1]] = m[2].trim();
      }
    }
  }

  return result;
}

// ─── State ─────────────────────────────────────────────────

state.configRaw = '';
state.configParsed = null;
state.configDirty = false;
state.configTags = {};
state.configCategories = {};

// Known YAML keys mapped to HTML input IDs
const CONFIG_FIELDS = [
  'title', 'subtitle', 'description', 'author',
  'keywords', 'url', 'root', 'permalink',
  'language', 'timezone',
];

// ─── Load ─────────────────────────────────────────────────

async function loadConfig() {
  try {
    const data = await getConfig();
    if (data.notFound) {
      safeSetText('config-loading', 'config.yml 未找到，保存后将自动创建');
      state.configRaw = '';
      state.configParsed = null;
      showConfigForm();
    } else {
      state.configRaw = data.raw || '';
      state.configParsed = data.parsed || {};
      renderConfigForm();
    }
  } catch (err) {
    document.getElementById('config-loading').textContent = `加载失败: ${err.message}`;
  }
}

// ─── Render ───────────────────────────────────────────────

function showConfigForm() {
  document.getElementById('config-loading').classList.add('hidden');
  document.getElementById('config-form-wrap').classList.remove('hidden');
  document.getElementById('config-editor').value = state.configRaw || '';
}

function renderConfigForm() {
  document.getElementById('config-loading').classList.add('hidden');
  document.getElementById('config-form-wrap').classList.remove('hidden');

  const raw = state.configRaw || '';
  const parsed = state.configParsed || {};

  // Populate visual form fields
  for (const key of CONFIG_FIELDS) {
    const el = document.getElementById(`cfg-${key}`);
    if (!el) continue;
    let val = parsed[key];
    if (val === undefined || val === null) val = '';
    if (Array.isArray(val)) val = val.join(', ');
    el.value = String(val);
    // Listen for changes
    el.addEventListener('input', onConfigFieldChange);
    el.addEventListener('change', onConfigFieldChange);
  }

  // Populate raw YAML
  document.getElementById('config-editor').value = raw;

  // Load tag / category colors from parsed YAML
  state.configTags = parsed.tag_colors || (parsed.tagColors) || {};
  state.configCategories = parsed.category_colors || (parsed.categoryColors) || {};
  renderColorTable('site-tags-list', 'tag');
  renderColorTable('site-categories-list', 'category');

  state.configDirty = false;
  updateConfigModifiedDot();
}

// ─── Field Change → Sync to Raw ──────────────────────────

/** When any visual field changes, update the raw YAML */
let _configSyncTimer = null;
function onConfigFieldChange(e) {
  const key = e.target.dataset.yamlKey;
  if (!key) return;

  let value = e.target.value;
  state.configRaw = yamlSet(state.configRaw, key, value);

  // Sync raw textarea
  const rawEl = document.getElementById('config-editor');
  if (rawEl) rawEl.value = state.configRaw;

  markConfigDirty();
}

/** Mark config as modified, debounce the indicator */
function markConfigDirty() {
  state.configDirty = true;
  clearTimeout(_configSyncTimer);
  _configSyncTimer = setTimeout(() => {
    updateConfigModifiedDot();
    updateCommitIndicator();
  }, 300);
}

function updateConfigModifiedDot() {
  const dot = document.getElementById('config-modified-dot');
  if (!dot) return;
  if (state.configDirty) {
    dot.classList.remove('hidden');
    dot.title = '配置有未保存的修改';
  } else {
    dot.classList.add('hidden');
  }
}

// ─── Save ────────────────────────────────────────────────

async function saveConfigChanges() {
  // Ensure colors are synced into raw YAML before saving
  syncColorsToRaw();

  const rawEl = document.getElementById('config-editor');
  const raw = rawEl ? rawEl.value : state.configRaw;

  try {
    await saveConfig(raw);
    state.configRaw = raw;
    state.configDirty = false;
    updateConfigModifiedDot();
    toast('配置已保存 (尚未提交)', 'success');
    updateCommitIndicator();
  } catch (err) {
    toast(`保存失败: ${err.message}`, 'error');
  }
}

/** Sync tag_colors and category_colors back into the raw YAML string */
function syncColorsToRaw() {
  state.configRaw = yamlSetMap(state.configRaw, 'tag_colors', state.configTags);
  state.configRaw = yamlSetMap(state.configRaw, 'category_colors', state.configCategories);
  // Update raw textarea too
  const rawEl = document.getElementById('config-editor');
  if (rawEl) rawEl.value = state.configRaw;
}

// ─── Tag / Category Color Table ──────────────────────────

function renderColorTable(tableId, type) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  tbody.innerHTML = '';

  const items = type === 'tag' ? state.configTags : state.configCategories;
  const entries = Object.entries(items).sort(([a], [b]) => a.localeCompare(b));

  for (const [name, color] of entries) {
    const tr = document.createElement('tr');

    // Name
    const tdName = document.createElement('td');
    tdName.textContent = name || '';
    tr.appendChild(tdName);

    // Color picker
    const tdColor = document.createElement('td');
    tdColor.style.width = '48px';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color || '#cccccc';
    input.className = 'color-input';
    input.title = name;
    input.addEventListener('input', (e) => onColorUpdate(type, name, e.target.value));
    tdColor.appendChild(input);
    tr.appendChild(tdColor);

    // Hex
    const tdHex = document.createElement('td');
    tdHex.textContent = color || '#cccccc';
    tdHex.style.fontFamily = 'var(--font-mono)';
    tdHex.style.fontSize = '12px';
    tdHex.style.color = 'var(--mono-muted)';
    tdHex.id = `color-label-${CSS.escape(name)}`;
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
      if (type === 'tag') delete state.configTags[name];
      else delete state.configCategories[name];
      syncColorsToRaw();
      markConfigDirty();
      renderColorTable(type === 'tag' ? 'site-tags-list' : 'site-categories-list', type);
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  }
}

function onColorUpdate(type, name, color) {
  if (type === 'tag') state.configTags[name] = color;
  else state.configCategories[name] = color;

  const label = document.getElementById(`color-label-${CSS.escape(name)}`);
  if (label) label.textContent = color;

  syncColorsToRaw();
  markConfigDirty();
}

function addColorItem(type) {
  const inputId = type === 'tag' ? 'site-tag-new' : 'site-category-new';
  const input = document.getElementById(inputId);
  if (!input) return;
  const name = input.value.trim();
  if (!name) return toast('请输入名称', 'warning');

  if (type === 'tag') state.configTags[name] = '#cccccc';
  else state.configCategories[name] = '#cccccc';

  const tableId = type === 'tag' ? 'site-tags-list' : 'site-categories-list';
  syncColorsToRaw();
  markConfigDirty();
  renderColorTable(tableId, type);
  input.value = '';
}

// ─── Toggle Raw YAML ─────────────────────────────────────

function toggleRawConfig() {
  const section = document.getElementById('config-raw-section');
  const btn = document.getElementById('toggle-raw-config-btn');
  if (!section || !btn) return;

  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? '隐藏原始 YAML' : '显示原始 YAML';

  if (isHidden) {
    // Showing raw: sync colors and visual fields into YAML first
    syncColorsToRaw();
    for (const key of CONFIG_FIELDS) {
      const el = document.getElementById(`cfg-${key}`);
      if (el) state.configRaw = yamlSet(state.configRaw, key, el.value);
    }
    const rawEl = document.getElementById('config-editor');
    if (rawEl) rawEl.value = state.configRaw;
  } else {
    // Hiding raw: parse YAML back into all visual fields
    const rawEl = document.getElementById('config-editor');
    if (rawEl) {
      state.configRaw = rawEl.value;
      try {
        const parsed = parseYamlLite(state.configRaw);
        for (const key of CONFIG_FIELDS) {
          const el = document.getElementById(`cfg-${key}`);
          if (!el) continue;
          let val = parsed[key];
          if (val === undefined || val === null) val = '';
          if (Array.isArray(val)) val = val.join(', ');
          el.value = String(val);
        }
        state.configTags = parsed.tag_colors || {};
        state.configCategories = parsed.category_colors || {};
        renderColorTable('site-tags-list', 'tag');
        renderColorTable('site-categories-list', 'category');
      } catch { /* ignore parse errors from manual editing */ }
      markConfigDirty();
    }
  }
}

// ─── Sync raw textarea changes back ──────────────────────

function setupRawTextareaSync() {
  const rawEl = document.getElementById('config-editor');
  if (!rawEl) return;
  rawEl.addEventListener('input', () => {
    state.configRaw = rawEl.value;
    markConfigDirty();
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupRawTextareaSync();
});

// ─── Global Exports ──────────────────────────────────────

window.loadConfig = loadConfig;
window.saveConfigChanges = saveConfigChanges;
window.addColorItem = addColorItem;
window.toggleRawConfig = toggleRawConfig;
