import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readWorkflow(name) {
  return readFile(path.join(root, '.github', 'workflows', name), 'utf8');
}

test('EdgeOne loop workflow 预排后继运行并使用单独请求超时变量', async () => {
  const text = await readWorkflow('edgeone-monitor-loop.yml');

  assert.match(text, /LOOP_REQUEST_TIMEOUT_SECONDS/);
  assert.match(text, /--max-time "\$\{LOOP_REQUEST_TIMEOUT_SECONDS\}"/);
  assert.match(text, /Queue successor run early|dispatch_handoff/);
});
