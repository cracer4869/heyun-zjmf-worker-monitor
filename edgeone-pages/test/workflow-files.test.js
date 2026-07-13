import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readWorkflow(name) {
  return readFile(path.join(root, '.github', 'workflows', name), 'utf8');
}

async function readProjectFile(name) {
  return readFile(path.join(root, name), 'utf8');
}

test('EdgeOne loop 仅在临近截止时接力且 Bootstrap 每 30 分钟兜底', async () => {
  const text = await readWorkflow('edgeone-monitor-loop.yml');
  const bootstrap = await readWorkflow('edgeone-monitor-cron.yml');

  assert.match(text, /LOOP_REQUEST_TIMEOUT_SECONDS/);
  assert.match(text, /--max-time "\$\{LOOP_REQUEST_TIMEOUT_SECONDS\}"/);
  assert.doesNotMatch(text, /Queue successor run early/);
  assert.match(text, /remaining.*LOOP_HANDOFF_SECONDS/);
  assert.match(bootstrap, /cron: "17,47 \* \* \* \*"/);
});

test('Cloudflare 部署配置可重建且 Actions 使用最小权限', async () => {
  const deploy = await readWorkflow('deploy.yml');
  const wrangler = await readProjectFile('cloudflare-worker/wrangler.toml');

  assert.match(deploy, /permissions:\s+contents: read/);
  assert.match(deploy, /Normalize Cloudflare token/);
  assert.doesNotMatch(deploy, /uses: actions\/(checkout|setup-node)@v\d+/);
  assert.doesNotMatch(wrangler, /replace-with-your-d1-database-id/);
  assert.match(wrangler, /database_name = "zjmf-monitor-nas"/);
});

test('GitHub CI 同时验证 EdgeOne 和 Cloudflare', async () => {
  const ci = await readWorkflow('ci.yml');

  assert.match(ci, /working-directory: edgeone-pages/);
  assert.match(ci, /working-directory: cloudflare-worker/);
  assert.match(ci, /npm test/);
});
