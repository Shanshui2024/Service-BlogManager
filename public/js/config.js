// config.js — Site config management

async function loadConfig() {
  try {
    const data = await getConfig();
    state.configRaw = data.raw;
    state.configParsed = data.parsed;
    renderConfigEditor();
  } catch (err) {
    if (err.message.includes('not found')) {
      document.getElementById('config-loading').textContent = 'config.yml 未找到';
    } else {
      document.getElementById('config-loading').textContent = `加载失败: ${err.message}`;
    }
  }
}

function renderConfigEditor() {
  document.getElementById('config-loading').classList.add('hidden');
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

window.loadConfig = loadConfig;
window.saveConfigChanges = saveConfigChanges;
