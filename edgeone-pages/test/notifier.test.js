import assert from 'node:assert/strict';
import test from 'node:test';

import { Notifier } from '../src/notifier.js';

test('通知网络异常不向客户端暴露底层错误详情', async () => {
  const notifier = new Notifier(
    { webhook_type: 'custom', webhook_url: 'https://notify.example/webhook' },
    async () => {
      throw new Error('connect ECONNREFUSED at internal-notify-host:8443');
    },
  );

  const result = await notifier.send('测试', '内容');

  assert.deepEqual(result, { ok: false, error: 'NOTIFICATION_FAILED' });
});
