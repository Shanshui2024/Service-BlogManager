// yaml.js — Minimal YAML parser/serializer for config management

/**
 * Parse a simple YAML config string into a JS object.
 * Supports nested mappings, sequences, scalar values.
 */
function parseConfigYaml(text) {
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  let currentList = null;
  let inList = false;
  let listIndent = -1;

  function setValue(obj, key, value) {
    const parts = key.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i].trim();
      if (!target[p] || typeof target[p] !== 'object') target[p] = {};
      target = target[p];
    }
    target[parts[parts.length - 1].trim()] = value;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and empty lines
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) {
      if (inList && listIndent >= 0) {
        // Check if we're still in list context
        const indent = line.match(/^(\s*)/)[1].length;
        if (indent <= listIndent && line.trim()) {
          inList = false;
          currentList = null;
          listIndent = -1;
        }
      }
      continue;
    }

    const indent = line.match(/^(\s*)/)[1].length;

    // List item
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        listIndent = indent;
        currentList = [];
        if (currentKey) setValue(result, currentKey, currentList);
      }
      let item = listMatch[1].trim();
      // Remove quotes
      if ((item.startsWith('"') && item.endsWith('"')) ||
          (item.startsWith("'") && item.endsWith("'"))) {
        item = item.slice(1, -1);
      }
      // Try to parse as number or boolean
      if (item === 'true') item = true;
      else if (item === 'false') item = false;
      else if (item === 'null' || item === '~') item = null;
      else if (/^-?\d+(\.\d+)?$/.test(item)) item = Number(item);

      if (currentList !== null) {
        currentList.push(item);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const [, spaces, key, value] = kvMatch;
      const level = spaces.length;

      if (level === 0) {
        inList = false;
        currentList = null;
        listIndent = -1;
        currentKey = key;
      } else {
        currentKey = key;
      }

      let val = (value || '').trim();
      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Parse boolean/number/null
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'null' || val === '~') val = null;
      else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);

      if (val !== '' || value === '') {
        setValue(result, currentKey, val);
      } else {
        // Nested object starts
        if (level === 0) {
          setValue(result, key, {});
        }
      }
    }
  }

  return result;
}

/**
 * Serialize a JS object back to YAML string.
 */
function dumpConfig(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let result = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result += `${pad}${key}: null\n`;
    } else if (typeof value === 'boolean') {
      result += `${pad}${key}: ${value}\n`;
    } else if (typeof value === 'number') {
      result += `${pad}${key}: ${value}\n`;
    } else if (typeof value === 'string') {
      // Quote if contains special chars
      const needsQuote = /[:\{\}\[\],&\*\?\|<>=!%@`#]/.test(value) || value.includes('\n');
      if (needsQuote) {
        result += `${pad}${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        result += `${pad}${key}: ${value}\n`;
      }
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result += `${pad}${key}: []\n`;
      } else {
        result += `${pad}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'string') {
            const needsQuote = /[:\{\}\[\],&\*\?\|<>=!%@`#]/.test(item);
            if (needsQuote) {
              result += `${pad}  - "${item.replace(/"/g, '\\"')}"\n`;
            } else {
              result += `${pad}  - ${item}\n`;
            }
          } else if (typeof item === 'object' && item !== null) {
            result += `${pad}  - \n${dumpConfig(item, indent + 2)}`;
          } else {
            result += `${pad}  - ${item}\n`;
          }
        }
      }
    } else if (typeof value === 'object') {
      result += `${pad}${key}:\n${dumpConfig(value, indent + 1)}`;
    }
  }

  return result;
}

window.parseConfigYaml = parseConfigYaml;
window.dumpConfig = dumpConfig;
