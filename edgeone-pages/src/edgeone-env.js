const EDGEONE_GLOBALS = [
  'ADMIN_TOKEN',
  'ZJMF_KV',
  'KV',
  'EDGEONE_KV',
  'GITHUB_REPOSITORY',
  'GITHUB_BRANCH',
  'GITHUB_WORKFLOW_FILE',
  'GITHUB_TOKEN',
  'WEB_UPDATE_GITHUB_TOKEN',
  'APP_VERSION',
];

function readInjectedBinding(name) {
  try {
    if (name === 'ZJMF_KV' && typeof ZJMF_KV !== 'undefined') return ZJMF_KV;
    if (name === 'KV' && typeof KV !== 'undefined') return KV;
    if (name === 'EDGEONE_KV' && typeof EDGEONE_KV !== 'undefined') return EDGEONE_KV;
    if (name === 'ADMIN_TOKEN' && typeof ADMIN_TOKEN !== 'undefined') return ADMIN_TOKEN;
    if (name === 'GITHUB_REPOSITORY' && typeof GITHUB_REPOSITORY !== 'undefined') return GITHUB_REPOSITORY;
    if (name === 'GITHUB_BRANCH' && typeof GITHUB_BRANCH !== 'undefined') return GITHUB_BRANCH;
    if (name === 'GITHUB_WORKFLOW_FILE' && typeof GITHUB_WORKFLOW_FILE !== 'undefined') return GITHUB_WORKFLOW_FILE;
    if (name === 'GITHUB_TOKEN' && typeof GITHUB_TOKEN !== 'undefined') return GITHUB_TOKEN;
    if (name === 'WEB_UPDATE_GITHUB_TOKEN' && typeof WEB_UPDATE_GITHUB_TOKEN !== 'undefined') return WEB_UPDATE_GITHUB_TOKEN;
    if (name === 'APP_VERSION' && typeof APP_VERSION !== 'undefined') return APP_VERSION;
  } catch {
    return undefined;
  }
  return undefined;
}

function readGlobal(name) {
  const injected = readInjectedBinding(name);
  if (injected !== undefined) return injected;
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

export function mergeEdgeOneEnv(env = {}) {
  const merged = { ...(env || {}) };
  for (const name of EDGEONE_GLOBALS) {
    if (merged[name] === undefined) merged[name] = readGlobal(name);
  }
  return merged;
}
