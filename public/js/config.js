// config.js — Visual site config editor matching real config.yml

// ─── YAML String Helpers ───────────────────────────────────

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Get simple scalar from YAML raw text */
function yamlGet(raw, key) {
  const re = new RegExp(`^${escapeRegex(key)}:\\s*(.+)$`, 'm');
  const m = raw.match(re);
  if (!m) return '';
  let val = m[1].trim();
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"')))
    val = val.slice(1, -1);
  return val;
}

/** Set simple scalar in YAML raw text */
function yamlSet(raw, key, value) {
  // If value is empty string and key doesn't exist, skip adding
  const re = new RegExp(`^${escapeRegex(key)}:\\s*.+$`, 'm');
  if (re.test(raw)) {
    if (!value && value !== '0') return raw.replace(new RegExp(`^${escapeRegex(key)}:\\s*.+$`, 'm'), `${key}:`);
    return raw.replace(re, `${key}: ${value}`);
  }
  if (!value && value !== '0') return raw;
  return raw.trimEnd() + '\n' + `${key}: ${value}` + '\n';
}

/** Get boolean from YAML */
function yamlGetBool(raw, key) {
  const v = yamlGet(raw, key).toLowerCase();
  return v === 'true' || v === '1';
}

/** Set boolean in YAML */
function yamlSetBool(raw, key, value) {
  return yamlSet(raw, key, value ? 'true' : 'false');
}

/** Get YAML map block (e.g. tagColors: ...) */
function yamlGetMap(raw, key) {
  const yk = escapeRegex(key);
  const re = new RegExp(`^${yk}:\\s*\\n((?:  .+\\n?)*)`, 'm');
  const m = raw.match(re);
  if (!m) return {};
  const result = {};
  const lines = m[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^  (\S[^:]*):\s*(.+)$/);
    if (kv) result[kv[1].trim()] = kv[2].trim();
  }
  return result;
}

/** Set YAML map block in raw text */
function yamlSetMap(raw, key, entries) {
  const sorted = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b));
  const yk = escapeRegex(key);
  // Remove existing block
  const reBlock = new RegExp(`^${yk}:\\s*\\n(?:  .+\\n?)*`, 'm');
  if (reBlock.test(raw)) raw = raw.replace(reBlock, '').replace(/\n{3,}/g, '\n\n');
  // Append new block
  if (sorted.length === 0) return raw.trimEnd() + '\n';
  const lines = sorted.map(([k, v]) => `  ${k}: ${v}`);
  const block = `${key}:\n${lines.join('\n')}\n`;
  return raw.trimEnd() + '\n' + block;
}

// ─── Navigation Array Helpers ──────────────────────────────

function yamlGetNav(raw) {
  const re = /^navigation:\n((?:  - .+\n(?:    .+\n)?)*)/m;
  const m = raw.match(re);
  if (!m) return [];
  const items = [];
  const lines = m[1].split('\n');
  let cur = null;
  for (const line of lines) {
    const lm = line.match(/^  - label:\s*(.+)$/);
    const hm = line.match(/^    href:\s*(.+)$/);
    if (lm) {
      if (cur) items.push(cur);
      cur = { label: lm[1].trim(), href: '' };
    } else if (hm && cur) {
      let href = hm[1].trim();
      if ((href.startsWith('"') && href.endsWith('"')) || (href.startsWith("'") && href.endsWith("'")))
        href = href.slice(1, -1);
      cur.href = href;
    }
  }
  if (cur) items.push(cur);
  return items;
}

function yamlSetNav(raw, items) {
  const re = /^navigation:\n(?:  - .+\n(?:    .+\n)?)*/m;
  raw = raw.replace(re, '');
  if (items.length === 0) return raw;
  let block = '\nnavigation:';
  for (const it of items) {
    block += `\n  - label: ${it.label}`;
    block += `\n    href: ${it.href}`;
  }
  return raw.trimEnd() + block + '\n';
}

// ─── State ─────────────────────────────────────────────────

state.configRaw = '';
state.configParsed = null;
state.configDirty = false;
state.configNav = [];
// Maps live in state.configParsed

// Flat keys
const ALL_FLAT_KEYS = [
  'title', 'description', 'author', 'language', 'favicon',
  'url', 'keywords', 'customJs', 'icp', 'moe', 'copyright', 'footerLinks',
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
    document.getElementById('config-loading').textContent =
      `加载失败: ${err.message}`;
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
  const p = state.configParsed || {};

  // Flat text fields
  for (const key of ALL_FLAT_KEYS) {
    const el = document.getElementById(`cfg-${key}`);
    if (!el) continue;
    let val = p[key];
    if (val === undefined || val === null) val = '';
    el.value = String(val);
    bindField(el);
  }

  // Bool checkbox – showBuildInfo
  const bsi = document.getElementById('cfg-showBuildInfo');
  if (bsi) {
    bsi.checked = !!p.showBuildInfo;
    bindField(bsi);
  }

  // Nested: notice
  const nMsg = document.getElementById('cfg-notice-message');
  const nDis = document.getElementById('cfg-notice-dismissible');
  if (nMsg) {
    nMsg.value = (p.notice && p.notice.message) || '';
    bindField(nMsg);
  }
  if (nDis) {
    nDis.checked = p.notice ? p.notice.dismissible !== false : true;
    bindField(nDis);
  }

  // Nested: socials
  for (const sk of ['github', 'twitter']) {
    const el = document.getElementById(`cfg-socials-${sk}`);
    if (el) {
      el.value = (p.socials && p.socials[sk]) || '';
      bindField(el);
    }
  }

  // Nested: giscus (11 fields)
  const giscusKeys = [
    'repo','repoId','category','categoryId','mapping','strict',
    'reactionsEnabled','emitMetadata','inputPosition','theme','lang',
  ];
  for (const gk of giscusKeys) {
    const el = document.getElementById(`cfg-giscus-${gk}`);
    if (el) {
      el.value = (p.giscus && p.giscus[gk] !== undefined) ? p.giscus[gk] : '';
      bindField(el);
    }
  }

  // Nested: hotArticles
  const haEn = document.getElementById('cfg-hotArticles-enabled');
  const haMc = document.getElementById('cfg-hotArticles-maxCount');
  if (haEn) {
    haEn.checked = p.hotArticles ? p.hotArticles.enabled !== false : false;
    bindField(haEn);
  }
  if (haMc) {
    haMc.value = (p.hotArticles && p.hotArticles.maxCount) || 5;
    bindField(haMc);
  }

  // Nested: ads
  const adsEn = document.getElementById('cfg-ads-enabled');
  if (adsEn) {
    adsEn.checked = p.ads ? p.ads.enabled === true : false;
    bindField(adsEn);
  }

  // Raw YAML
  document.getElementById('config-editor').value = raw;

  // Navigation table
  state.configNav = yamlGetNav(raw);
  renderNavTable();

  // Map tables
  renderMapTable('tagColors');
  renderMapTable('categoryColors');
  renderSlugTable('categorySlugs');
  renderSlugTable('tagSlugs');

  state.configDirty = false;
  updateConfigModifiedDot();
}

// ─── Field Binding ────────────────────────────────────────

function bindField(el) {
  if (el.dataset._bound) return;
  el.dataset._bound = '1';
  el.addEventListener('input', onFieldChange);
  el.addEventListener('change', onFieldChange);
}

/** Deferred sync timer */
let _syncTimer = null;
function markDirty() {
  state.configDirty = true;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    updateConfigModifiedDot();
    updateCommitIndicator();
  }, 300);
}

// ─── Field Change Handler ─────────────────────────────────

function onFieldChange(e) {
  const el = e.target;
  const key = el.dataset.cfgKey;
  const parent = el.dataset.cfgParent;
  const child = el.dataset.cfgChild;
  const isBool = el.dataset.cfgType === 'bool';

  let value;
  if (el.type === 'checkbox') value = el.checked ? 'true' : 'false';
  else value = el.value;

  if (key) {
    // Flat key OR flat bool
    if (isBool) state.configRaw = yamlSetBool(state.configRaw, key, el.checked);
    else state.configRaw = yamlSet(state.configRaw, key, value);
  } else if (parent && child) {
    // Nested key
    const map = yamlGetMap(state.configRaw, parent);
    if (isBool) map[child] = el.checked ? 'true' : 'false';
    else map[child] = value;
    state.configRaw = yamlSetMap(state.configRaw, parent, map);
  }

  // Sync raw textarea
  const rawEl = document.getElementById('config-editor');
  if (rawEl) rawEl.value = state.configRaw;

  markDirty();
}

// ─── Navigation Table ─────────────────────────────────────

function renderNavTable() {
  const tbody = document.getElementById('site-nav-list');
  if (!tbody) return;
  tbody.innerHTML = '';
  const items = state.configNav || [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const tr = document.createElement('tr');

    // Label
    const tdL = document.createElement('td');
    const inpL = document.createElement('input');
    inpL.type = 'text';
    inpL.className = 'input table-input';
    inpL.value = it.label || '';
    inpL.addEventListener('input', (e) => {
      items[i].label = e.target.value;
      syncNavToRaw();
      markDirty();
    });
    tdL.appendChild(inpL);
    tr.appendChild(tdL);

    // Href
    const tdH = document.createElement('td');
    const inpH = document.createElement('input');
    inpH.type = 'text';
    inpH.className = 'input table-input';
    inpH.value = it.href || '';
    inpH.addEventListener('input', (e) => {
      items[i].href = e.target.value;
      syncNavToRaw();
      markDirty();
    });
    tdH.appendChild(inpH);
    tr.appendChild(tdH);

    // Delete
    const tdD = document.createElement('td');
    tdD.style.textAlign = 'right';
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-danger';
    btn.style.padding = '2px 8px'; btn.style.fontSize = '11px';
    btn.textContent = '删除';
    btn.addEventListener('click', () => {
      items.splice(i, 1);
      syncNavToRaw();
      markDirty();
      renderNavTable();
    });
    tdD.appendChild(btn);
    tr.appendChild(tdD);

    tbody.appendChild(tr);
  }
}

function addNavItem() {
  const labelEl = document.getElementById('nav-new-label');
  const hrefEl = document.getElementById('nav-new-href');
  const label = labelEl ? labelEl.value.trim() : '';
  const href = hrefEl ? hrefEl.value.trim() : '';
  if (!label) return toast('请输入导航名称', 'warning');
  if (!href) return toast('请输入导航链接', 'warning');

  state.configNav.push({ label, href });
  syncNavToRaw();
  markDirty();
  renderNavTable();
  if (labelEl) labelEl.value = '';
  if (hrefEl) hrefEl.value = '';
}

function syncNavToRaw() {
  state.configRaw = yamlSetNav(state.configRaw, state.configNav);
  const rawEl = document.getElementById('config-editor');
  if (rawEl) rawEl.value = state.configRaw;
}

// ─── Color Map Tables (tagColors / categoryColors) ────────

function renderMapTable(mapKey) {
  const tableId = `map-${mapKey}-list`;
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  const items = yamlGetMap(state.configRaw, mapKey);
  const entries = Object.entries(items).sort(([a], [b]) => a.localeCompare(b));
  tbody.innerHTML = '';

  for (const [name, color] of entries) {
    const tr = document.createElement('tr');
    // Name
    const tdN = document.createElement('td');
    tdN.textContent = name;
    tr.appendChild(tdN);
    // Color picker
    const tdp = document.createElement('td');
    tdp.style.width = '48px';
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = color || '#cccccc';
    inp.className = 'color-input';
    inp.addEventListener('input', (e) => {
      const m = yamlGetMap(state.configRaw, mapKey);
      m[name] = e.target.value;
      state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
      const hex = document.getElementById(`hex-${CSS.escape(tableId)}-${CSS.escape(name)}`);
      if (hex) hex.textContent = e.target.value;
      syncRawTA();
      markDirty();
    });
    tdp.appendChild(inp);
    tr.appendChild(tdp);
    // Hex
    const tdh = document.createElement('td');
    tdh.textContent = color || '#cccccc';
    tdh.id = `hex-${CSS.escape(tableId)}-${CSS.escape(name)}`;
    tdh.style.fontFamily = 'var(--font-mono)';
    tdh.style.fontSize = '12px';
    tdh.style.color = 'var(--mono-muted)';
    tr.appendChild(tdh);
    // Delete
    const tdD = document.createElement('td');
    tdD.style.textAlign = 'right';
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-danger';
    btn.style.padding = '2px 8px'; btn.style.fontSize = '11px';
    btn.textContent = '删除';
    btn.addEventListener('click', () => {
      const m = yamlGetMap(state.configRaw, mapKey);
      delete m[name];
      state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
      syncRawTA();
      markDirty();
      renderMapTable(mapKey);
    });
    tdD.appendChild(btn);
    tr.appendChild(tdD);

    tbody.appendChild(tr);
  }
}

function addMapItem(mapKey) {
  const inputId = mapKey === 'tagColors' ? 'color-tag-name' : 'color-cat-name';
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return toast('请输入名称', 'warning');
  const m = yamlGetMap(state.configRaw, mapKey);
  if (m[name]) return toast('该名称已存在', 'warning');
  m[name] = '#cccccc';
  state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
  syncRawTA();
  markDirty();
  renderMapTable(mapKey);
  inp.value = '';
}

// ─── Slug Tables (categorySlugs / tagSlugs) ───────────────

function renderSlugTable(mapKey) {
  const tableId = mapKey === 'categorySlugs' ? 'slug-category-list' : 'slug-tag-list';
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  const items = yamlGetMap(state.configRaw, mapKey);
  const entries = Object.entries(items).sort(([a], [b]) => a.localeCompare(b));
  tbody.innerHTML = '';

  for (const [name, slug] of entries) {
    const tr = document.createElement('tr');
    // Name
    const tdN = document.createElement('td');
    const inpN = document.createElement('input');
    inpN.type = 'text'; inpN.className = 'input table-input';
    inpN.value = name;
    inpN.addEventListener('input', (e) => {
      const m = yamlGetMap(state.configRaw, mapKey);
      const oldSlug = m[name];
      delete m[name];
      m[e.target.value] = oldSlug;
      state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
      syncRawTA(); markDirty();
    });
    tdN.appendChild(inpN);
    tr.appendChild(tdN);
    // Slug
    const tdS = document.createElement('td');
    const inpS = document.createElement('input');
    inpS.type = 'text'; inpS.className = 'input table-input';
    inpS.value = slug;
    inpS.addEventListener('input', (e) => {
      const m = yamlGetMap(state.configRaw, mapKey);
      m[name] = e.target.value;
      state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
      syncRawTA(); markDirty();
    });
    tdS.appendChild(inpS);
    tr.appendChild(tdS);
    // Delete
    const tdD = document.createElement('td');
    tdD.style.textAlign = 'right';
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-danger';
    btn.style.padding = '2px 8px'; btn.style.fontSize = '11px';
    btn.textContent = '删除';
    btn.addEventListener('click', () => {
      const m = yamlGetMap(state.configRaw, mapKey);
      delete m[name];
      state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
      syncRawTA(); markDirty();
      renderSlugTable(mapKey);
    });
    tdD.appendChild(btn);
    tr.appendChild(tdD);

    tbody.appendChild(tr);
  }
}

function addSlugItem(mapKey) {
  const nameId = mapKey === 'categorySlugs' ? 'slug-cat-name' : 'slug-tag-name';
  const slugId = mapKey === 'categorySlugs' ? 'slug-cat-slug' : 'slug-tag-slug';
  const nameEl = document.getElementById(nameId);
  const slugEl = document.getElementById(slugId);
  if (!nameEl || !slugEl) return;
  const name = nameEl.value.trim();
  const slug = slugEl.value.trim();
  if (!name) return toast('请输入名称', 'warning');
  if (!slug) return toast('请输入 Slug', 'warning');
  const m = yamlGetMap(state.configRaw, mapKey);
  if (m[name]) return toast('该名称已存在', 'warning');
  m[name] = slug;
  state.configRaw = yamlSetMap(state.configRaw, mapKey, m);
  syncRawTA(); markDirty();
  renderSlugTable(mapKey);
  nameEl.value = '';
  slugEl.value = '';
}

// ─── Raw YAML Sync ────────────────────────────────────────

function syncRawTA() {
  const el = document.getElementById('config-editor');
  if (el) el.value = state.configRaw;
}

// ─── Toggle Raw YAML ─────────────────────────────────────

function toggleRawConfig() {
  const section = document.getElementById('config-raw-section');
  const btn = document.getElementById('toggle-raw-config-btn');
  if (!section || !btn) return;
  const hidden = section.style.display === 'none';
  section.style.display = hidden ? '' : 'none';
  btn.textContent = hidden ? '隐藏原始 YAML' : '显示原始 YAML';

  if (hidden) {
    // Before showing, flush all visual state → raw
    syncNavToRaw();
    syncRawTA();
  } else {
    // After hiding, parse raw back → visual
    const rawEl = document.getElementById('config-editor');
    if (rawEl) {
      state.configRaw = rawEl.value;
      state.configNav = yamlGetNav(state.configRaw);
      // Repopulate flat fields
      const p = parseYamlLite(state.configRaw);
      for (const key of ALL_FLAT_KEYS) {
        const el = document.getElementById(`cfg-${key}`);
        if (!el) continue;
        let val = p[key];
        if (val === undefined || val === null) val = '';
        el.value = String(val);
      }
      const bsi = document.getElementById('cfg-showBuildInfo');
      if (bsi) bsi.checked = !!p.showBuildInfo;
      // Repopulate nested fields
      if (p.notice) {
        safeSetVal('cfg-notice-message', p.notice.message || '');
        const nd = document.getElementById('cfg-notice-dismissible');
        if (nd) nd.checked = p.notice.dismissible !== false;
      }
      if (p.socials) {
        safeSetVal('cfg-socials-github', p.socials.github || '');
        safeSetVal('cfg-socials-twitter', p.socials.twitter || '');
      }
      if (p.giscus) {
        const gks = ['repo','repoId','category','categoryId','mapping','strict',
          'reactionsEnabled','emitMetadata','inputPosition','theme','lang'];
        for (const gk of gks)
          safeSetVal(`cfg-giscus-${gk}`, p.giscus[gk] !== undefined ? String(p.giscus[gk]) : '');
      }
      if (p.hotArticles) {
        const haE = document.getElementById('cfg-hotArticles-enabled');
        if (haE && p.hotArticles.enabled !== undefined)
          haE.checked = String(p.hotArticles.enabled).toLowerCase() === 'true';
        safeSetVal('cfg-hotArticles-maxCount', p.hotArticles.maxCount !== undefined ? String(p.hotArticles.maxCount) : '5');
      }
      if (p.ads) {
        const aE = document.getElementById('cfg-ads-enabled');
        if (aE && p.ads.enabled !== undefined)
          aE.checked = String(p.ads.enabled).toLowerCase() === 'true';
      }
      renderNavTable();
      renderMapTable('tagColors');
      renderMapTable('categoryColors');
      renderSlugTable('categorySlugs');
      renderSlugTable('tagSlugs');
      markDirty();
    }
  }
}

/** Light YAML parser for flat keys + 1-level nested */
function parseYamlLite(raw) {
  const r = {};
  if (!raw) return r;
  const lines = raw.split('\n');
  let mapKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (mapKey && !line.startsWith('  ') && line.trim() !== '') { mapKey = null; }
    const kv = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (kv && !mapKey) {
      const k = kv[1]; let v = kv[2].trim();
      const next = lines[i + 1];
      if (next && next.match(/^  \S/)) { mapKey = k; r[k] = {}; continue; }
      r[k] = v;
    } else if (mapKey) {
      const m = line.match(/^  (\S[^:]*):\s*(.*)$/);
      if (m) r[mapKey][m[1]] = m[2].trim();
    }
  }
  // Convert known bools
  for (const bk of ['showBuildInfo', 'dismissible'])
    if (r[bk] !== undefined) r[bk] = String(r[bk]).toLowerCase() === 'true';
  return r;
}

function safeSetVal(id, val) {
  const el = document.getElementById(id);
  if (el) {
    if (el.type === 'checkbox') el.checked = String(val).toLowerCase() === 'true';
    else el.value = val;
  }
}

// ─── Modified Dot ─────────────────────────────────────────

function updateConfigModifiedDot() {
  const dot = document.getElementById('config-modified-dot');
  if (!dot) return;
  if (state.configDirty) { dot.classList.remove('hidden'); dot.title = '配置有未保存的修改'; }
  else dot.classList.add('hidden');
}

// ─── Save ────────────────────────────────────────────────

async function saveConfigChanges() {
  // Flush all visual → raw
  syncNavToRaw();
  syncRawTA();

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

// ─── Raw Textarea Sync ────────────────────────────────────

function setupRawTA() {
  const el = document.getElementById('config-editor');
  if (!el) return;
  el.addEventListener('input', () => {
    state.configRaw = el.value;
    markDirty();
  });
}

document.addEventListener('DOMContentLoaded', setupRawTA);

// ─── Exports ──────────────────────────────────────────────

window.loadConfig = loadConfig;
window.saveConfigChanges = saveConfigChanges;
window.toggleRawConfig = toggleRawConfig;
window.addMapItem = addMapItem;
window.addNavItem = addNavItem;
window.addSlugItem = addSlugItem;
