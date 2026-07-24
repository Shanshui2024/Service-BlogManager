// config.js — Blog config CRUD (uses backend local-git API)
import { getConfig, saveConfig } from './api.js';
import { parseConfigYaml, patchYamlText, dumpConfig } from './yaml.js';

export { parseConfigYaml, patchYamlText, dumpConfig };

/** Fetch config.yml from the backend */
export async function loadConfig() {
  const data = await getConfig();
  return { raw: data.raw, parsed: data.parsed };
}

/** Fetch and return parsed config for the settings page */
export async function getConfigStructured() {
  const { parsed } = await loadConfig();
  return parsed;
}

/** Save config.yml to the backend */
export async function writeConfig(content) {
  return saveConfig(content);
}
