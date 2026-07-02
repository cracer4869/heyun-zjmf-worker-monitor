import assert from 'node:assert/strict';
import test from 'node:test';

import { handleEdgeOneRequest, edgeOneTcpConnector } from '../src/handler.js';
import { onRequest } from '../edge-functions/index.js';

class MemoryKV {
  constructor() {
    this.map = new Map();
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async put(key, value) {
    this.map.set(key, value);
  }
}

test('EdgeOne handler 渲染初始化页', async () => {
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/'), {
    ADMIN_TOKEN: 'admin',
    ZJMF_KV: new MemoryKV(),
  });
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, /首次配置|管理面板/);
});

test('EdgeOne handler 使用 KV 管理接口', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/settings', {
    method: 'POST',
    headers: {
      authorization: 'Bearer admin',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ setup_completed: '1' }),
  }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
});

test('EdgeOne 管理接口返回 no-store 防止后台状态读到旧缓存', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer admin' },
  }), env);

  assert.equal(res.status, 200);
  assert.match(String(res.headers.get('cache-control') || ''), /no-store/);
  assert.match(String(res.headers.get('pragma') || ''), /no-cache/);
});

test('EdgeOne handler 支持全局 KV 绑定变量', async () => {
  const kv = new MemoryKV();
  const previous = globalThis.ZJMF_KV;
  globalThis.ZJMF_KV = kv;
  try {
    const res = await handleEdgeOneRequest(new Request('https://edgeone.example/'), {
      ADMIN_TOKEN: 'admin',
    });
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /首次配置|管理面板/);
  } finally {
    if (previous === undefined) {
      delete globalThis.ZJMF_KV;
    } else {
      globalThis.ZJMF_KV = previous;
    }
  }
});

test('EdgeOne TCP 连接器不依赖 Node 原生模块', async () => {
  await assert.rejects(
    () => edgeOneTcpConnector('127.0.0.1', 996, 1000),
    /EdgeOne Pages 暂不支持 TCP 原生端口探测/,
  );
});

test('Edge Function 入口支持全局 KV 绑定', async () => {
  const previous = globalThis.ZJMF_KV;
  globalThis.ZJMF_KV = new MemoryKV();
  try {
    const res = await onRequest({
      request: new Request('https://edgeone.example/'),
      env: { ADMIN_TOKEN: 'admin' },
    });
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /首次配置|管理面板/);
  } finally {
    if (previous === undefined) {
      delete globalThis.ZJMF_KV;
    } else {
      globalThis.ZJMF_KV = previous;
    }
  }
});

test('管理初始化弹窗支持滚动显示完整内容', async () => {
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/admin'), {
    ADMIN_TOKEN: 'admin',
    ZJMF_KV: new MemoryKV(),
  });
  const html = await res.text();

  assert.match(html, /#setupWizardModal,#notifyModal,#editModal\{align-items:start;overflow:auto\}/);
  assert.match(html, /#setupWizardModal \.setup-modal\{width:min\(1180px,calc\(100vw - 48px\)\);scrollbar-gutter:stable\}/);
  assert.match(html, /name="visible_on_status" type="hidden" value="false"/);
  const editModalStart = html.indexOf('id="editModal"');
  const editModal = html.slice(editModalStart, html.indexOf('</section>', editModalStart));
  assert.doesNotMatch(editModal, /daily_reboot_limit/);
  assert.match(html, /function fieldControl/);
  assert.match(html, /\[type="checkbox"\]/);
  assert.match(html, /填 IP 或完整网址；非默认端口才加 :端口/);
  assert.match(html, /HTTP\(S\) \+ API（EdgeOne 选这个）/);
  assert.match(html, /HTTP\(S\) \+ TCP \+ API（Cloudflare Worker 选这个）<\/option>/);
  assert.match(html, /统计窗口/);
  assert.match(html, /<option value="hour" selected>每小时/);
  assert.doesNotMatch(html, /支持的通知渠道/);
  assert.match(html, /README\.md/);
  assert.match(html, /<option value="bark">Bark/);
  assert.match(html, /<option value="telegram">Telegram/);
  assert.match(html, /<option value="feishu">飞书机器人/);
  assert.match(html, /<option value="wecom">企业微信机器人/);
  assert.match(html, /<option value="dingtalk">钉钉机器人/);
  assert.match(html, /<option value="slack">Slack Webhook/);
  assert.match(html, /<option value="discord">Discord Webhook/);
  assert.match(html, /失败阶段静默/);
  assert.match(html, /notifyToggleStack/);
  assert.doesNotMatch(html, /notifySwitchColumn/);
  assert.match(html, /name="notify_failure_silence"/);
  assert.match(html, /不勾选时，检测异常\/确认宕机会通知/);
  assert.match(html, /notify_failure_silence:false/);
  assert.match(html, /notify_failure_silence:b\.notify_failure_silence==='on'/);
  assert.doesNotMatch(html, /name="notify_failure_threshold"/);
  assert.match(html, /name="notify_token"/);
  assert.match(html, /name="notify_target"/);
  assert.match(html, /function syncNotifyFields/);
  assert.doesNotMatch(html, /showUrl=type==='pushplus'/);
  assert.match(html, /probeTcpField is-hidden/);
  assert.match(html, /#selectedHostPanel\{padding:12px 14px\}/);
  assert.match(html, /#selectedHostPanel \.grid2\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:10px\}/);
  assert.doesNotMatch(html, /id="serverIdInput"/);
  assert.doesNotMatch(html, /id="serverNameInput"/);
  assert.doesNotMatch(html, /三步检测/);
});

test('EdgeOne 初始化默认使用 HTTP(S) + API', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const setup = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers: {
      authorization: 'Bearer admin',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'account',
        api_password: 'secret',
      }],
      servers: [{
        id: '1001',
        name: '测试服务器',
        provider: 'heyunidc',
      }],
      settings: {},
      notification: { enabled: false },
    }),
  }), env);

  assert.equal(setup.status, 200);
  const overview = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer admin' },
  }), env);
  const data = await overview.json();

  assert.equal(data.servers[0].check_method, 'http_then_api');
});

test('EdgeOne 初始化会保存更多通知渠道字段并脱敏返回', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = { authorization: 'Bearer admin', 'content-type': 'application/json; charset=utf-8' };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [],
      servers: [],
      settings: {},
      notification: { enabled: true, type: 'telegram', notify_failure_silence: true, notify_token: 'bot-token', notify_target: '10086' },
    }),
  }), env);
  const overview = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer admin' },
  }), env);
  const data = await overview.json();

  assert.equal(data.settings.webhook_type, 'telegram');
  assert.equal(data.settings.notify_failure_silence, true);
  assert.equal(data.settings.notify_token, '已配置');
  assert.equal(data.settings.notify_target, '10086');
});

test('管理面板顶部提供重走初始教程入口', async () => {
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/admin'), {
    ADMIN_TOKEN: 'admin',
    ZJMF_KV: new MemoryKV(),
  });
  const html = await res.text();

  assert.match(html, /重走初始教程/);
  assert.match(html, /data-action="restart-tutorial"/);
});

test('重走初始教程会清空现有数据但保留管理密码', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = (token) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json; charset=utf-8',
  });
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/password', {
    method: 'POST',
    headers: headers('admin'),
    body: JSON.stringify({ old_password: 'admin', password: 'secret123' }),
  }), env);
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers: headers('secret123'),
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'account',
        api_password: 'secret',
      }],
      servers: [{
        id: '1001',
        name: '测试服务器',
        provider: 'heyunidc',
      }],
      settings: {},
      notification: { enabled: false },
    }),
  }), env);
  const reset = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup/reset', {
    method: 'POST',
    headers: headers('secret123'),
  }), env);
  assert.equal(reset.status, 200);

  const overview = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer secret123' },
  }), env);
  const data = await overview.json();

  assert.equal(data.providers.length, 0);
  assert.equal(data.servers.length, 0);
  assert.equal(data.settings.setup_completed, '0');
});

test('保存服务器时自动使用已有服务商', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc_demo_account',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'demo@example.com',
        api_password: 'secret',
      }],
      servers: [],
      settings: {},
      notification: { enabled: false },
    }),
  }), env);

  const save = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/servers', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: '1001', name: '测试服务器', provider: 'heyunidc' }),
  }), env);
  assert.equal(save.status, 200);

  const overview = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer admin' },
  }), env);
  const data = await overview.json();

  assert.equal(data.servers[0].provider, 'heyunidc_demo_account');
});

test('EdgeOne 编辑服务器时不传重启次数上限会保留旧值', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'demo@example.com',
        api_password: 'secret',
      }],
      servers: [{ id: '1001', name: '主服务器', provider: 'heyunidc', daily_reboot_limit: 9 }],
      settings: { default_daily_reboot_limit: 3 },
      notification: { enabled: false },
    }),
  }), env);

  const save = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/servers', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: '1001', name: '主服务器', provider: 'heyunidc' }),
  }), env);
  assert.equal(save.status, 200);

  const overview = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/overview', {
    headers: { authorization: 'Bearer admin' },
  }), env);
  const data = await overview.json();

  assert.equal(data.servers[0].daily_reboot_limit, 9);
});

test('EdgeOne 公共状态接口隐藏不在状态页显示的服务器', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'demo@example.com',
        api_password: 'secret',
      }],
      servers: [{ id: '1001', name: '隐藏服务器', provider: 'heyunidc', visible_on_status: false }],
      settings: {},
      notification: { enabled: false },
    }),
  }), env);

  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/status'), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.servers.length, 0);
});

test('EdgeOne 后台系统设置支持 GitHub 仓库字段', async () => {
  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/admin'), {
    ADMIN_TOKEN: 'admin',
    ZJMF_KV: new MemoryKV(),
  });
  const html = await res.text();

  assert.match(html, /name="github_repo"/);
  assert.match(html, /name="github_branch"/);
  assert.match(html, /name="github_workflow_file"/);
  assert.match(html, /监控链路/);
});

test('EdgeOne 更新检查支持读取 GitHub 工作流设置', async () => {
  const kv = new MemoryKV();
  const env = {
    ADMIN_TOKEN: 'admin',
    ZJMF_KV: kv,
    APP_VERSION: 'abc1234',
    fetcher: async (url) => {
      const text = String(url);
      if (text.endsWith('/commits/main')) {
        return new Response(JSON.stringify({
          sha: 'def5678',
          commit: { committer: { date: '2026-07-02T08:00:00Z' }, message: 'fix: sync edgeone workflow' },
        }));
      }
      if (text.endsWith('/commits/abc1234')) {
        return new Response(JSON.stringify({
          sha: 'abc1234',
          commit: { committer: { date: '2026-07-02T07:00:00Z' }, message: 'feat: old deploy' },
        }));
      }
      if (text.includes('/commits?')) {
        return new Response(JSON.stringify([
          { sha: 'def5678' },
          { sha: 'abc1234' },
        ]));
      }
      throw new Error(`Unexpected URL: ${text}`);
    },
  };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };

  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/settings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      github_repo: 'cracer4869/heyun-zjmf-worker-monitor',
      github_branch: 'main',
      github_workflow_file: 'edgeone-monitor-cron.yml',
    }),
  }), env);

  const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/update/check', {
    headers: { authorization: 'Bearer admin' },
  }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.configured, true);
  assert.equal(data.workflow, 'edgeone-monitor-cron.yml');
  assert.match(data.actions_url, /edgeone-monitor-cron\.yml/);
});

test('EdgeOne 默认运行接口不强制绕过探测间隔', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'demo@example.com',
        api_password: 'secret',
      }],
      servers: [{ id: '1001', name: '主服务器', provider: 'heyunidc', check_method: 'api_only' }],
      settings: { check_interval: 300 },
      notification: { enabled: false },
    }),
  }), env);

  const runtimeMap = JSON.parse(await kv.get('zjmf_monitor_runtimes') || '{}');
  runtimeMap['1001'] = {
    state: 'healthy',
    consecutive_failures: 0,
    consecutive_successes: 1,
    last_check_time: Math.floor(Date.now() / 1000),
    last_reboot_time: 0,
    reboot_count_today: 0,
    reboot_date: '',
    last_status_value: 'HTTP 200',
    state_changed_at: 0,
    first_failure_at: 0,
    reboot_initiated_at: 0,
    scheduled_reboot_date: '',
  };
  await kv.put('zjmf_monitor_runtimes', JSON.stringify(runtimeMap));

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('should not fetch when interval has not elapsed');
  };
  try {
    const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/run', {
      method: 'POST',
      headers: { authorization: 'Bearer admin' },
    }), env);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.checked, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('EdgeOne 单服务器测试接口只探测目标服务器且不触发恢复动作', async () => {
  const kv = new MemoryKV();
  const env = { ADMIN_TOKEN: 'admin', ZJMF_KV: kv };
  const headers = {
    authorization: 'Bearer admin',
    'content-type': 'application/json; charset=utf-8',
  };
  await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/setup', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      providers: [{
        name: 'heyunidc',
        display_name: '核云',
        api_base_url: 'https://api.example/v1',
        api_account: 'demo@example.com',
        api_password: 'secret',
      }],
      servers: [
        { id: '1001', name: '一号', provider: 'heyunidc', check_method: 'api_only' },
        { id: '1002', name: '二号', provider: 'heyunidc', check_method: 'api_only' },
      ],
      settings: {},
      notification: { enabled: false },
    }),
  }), env);

  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/hosts/1001/module/status')) return new Response('off');
    if (String(url).includes('/hosts/1002/module/status')) return new Response('on');
    if (String(url).includes('/module/on')) return new Response(JSON.stringify({ msg: '成功' }));
    if (String(url).includes('/hard_reboot')) return new Response(JSON.stringify({ msg: '成功' }));
    if (String(url).includes('/login_api')) return new Response(JSON.stringify({ jwt: 'jwt' }));
    throw new Error(`Unexpected URL: ${String(url)}`);
  };
  try {
    const res = await handleEdgeOneRequest(new Request('https://edgeone.example/api/admin/run/1001', {
      method: 'POST',
      headers: { authorization: 'Bearer admin' },
    }), env);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.checked, 1);
    assert.equal(data.server_id, '1001');
    assert.equal(calls.some((url) => url.includes('/hosts/1002/module/status')), false);
    assert.equal(calls.some((url) => url.includes('/module/on')), false);
    assert.equal(calls.some((url) => url.includes('/hard_reboot')), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
