import assert from 'node:assert/strict';
import test from 'node:test';

import { KVRepository } from '../src/kv-repository.js';

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

class RaceKV {
  constructor(initialState) {
    this.map = new Map([
      ['zjmf_monitor_state', JSON.stringify(initialState)],
    ]);
    this.stateGets = [];
    this.statePuts = [];
    this.releaseGets = null;
    this.releasePuts = null;
    this.readyForGets = new Promise((resolve) => {
      this.releaseGets = resolve;
    });
    this.readyForPuts = new Promise((resolve) => {
      this.releasePuts = resolve;
    });
  }

  async get(key) {
    if (key === 'zjmf_monitor_state') {
      this.stateGets.push(key);
      if (this.stateGets.length === 2) this.releaseGets();
      await this.readyForGets;
    }
    return this.map.get(key) || null;
  }

  async put(key, value) {
    if (key === 'zjmf_monitor_state') {
      this.statePuts.push({ key, value });
      if (this.statePuts.length === 2) this.releasePuts();
      await this.readyForPuts;
    }
    this.map.set(key, value);
  }
}

test('KVRepository 保存服务商、服务器和设置', async () => {
  const repo = new KVRepository(new MemoryKV());
  await repo.setSetting('setup_completed', '1');
  await repo.upsertProvider({
    name: 'heyunidc',
    display_name: '核云',
    api_base_url: 'https://api.example/v1',
    api_account: 'account',
    api_password: 'secret',
  }, 100);
  await repo.upsertServer({
    id: '1001',
    name: '测试服务器',
    provider: 'heyunidc',
    check_method: 'api_only',
    enabled: true,
  }, 100);

  assert.equal(await repo.getSetting('setup_completed'), '1');
  assert.equal((await repo.listProviders())[0].name, 'heyunidc');
  assert.equal((await repo.listEnabledServers())[0].id, '1001');
});

test('KVRepository 生成状态页所需历史和事件', async () => {
  const repo = new KVRepository(new MemoryKV());
  await repo.addCheckResult({ server_id: '1001', ok: true, latency_ms: 23, created_at: 1700000000 });
  await repo.addEvent({ server_id: '1001', old_state: 'healthy', new_state: 'suspect', label: '检测异常', level: 'warning', message: '异常', created_at: 1700000000 });

  const recent = await repo.listRecentChecks('1001');
  const daily = await repo.listDailyHistory(['1001'], 30, 1700000300);
  const events = await repo.listPublicEvents(['1001']);

  assert.equal(recent[0].ok, true);
  assert.equal(daily.get('1001')[0].checks, 1);
  assert.equal(events.get('1001')[0].label, '检测异常');
});

test('KVRepository 并发保存服务器和运行时不会互相覆盖', async () => {
  const kv = new RaceKV({
    settings: {},
    providers: [],
    servers: [{ id: '3634', name: '旧名称', provider: 'heyun', enabled: true }],
    runtimes: {},
    events: [],
    check_results: [],
    next_event_id: 1,
    next_check_id: 1,
  });
  const repoA = new KVRepository(kv);
  const repoB = new KVRepository(kv);

  const saveServer = repoA.upsertServer({
    id: '3634',
    name: '新名称',
    provider: 'heyun',
    enabled: true,
  }, 200);
  const saveRuntime = repoB.saveRuntime('3634', {
    state: 'suspect',
    consecutive_failures: 1,
    consecutive_successes: 0,
    last_check_time: 200,
    last_reboot_time: 0,
    reboot_count_today: 0,
    reboot_date: '',
    last_status_value: 'HTTP 502 -> off',
    state_changed_at: 200,
    first_failure_at: 200,
    reboot_initiated_at: 0,
    scheduled_reboot_date: '',
  });

  await Promise.all([saveServer, saveRuntime]);

  const servers = await repoA.listServers();
  const runtime = await repoA.getRuntime('3634');
  assert.equal(servers[0].name, '新名称');
  assert.equal(runtime.state, 'suspect');
});

test('KVRepository 运行租约同一时刻只允许一个持有者', async () => {
  const repoA = new KVRepository(new MemoryKV());
  const repoB = new KVRepository(repoA.kv);

  const leaseA = await repoA.acquireRunLease('worker-a', 100, 60);
  const leaseB = await repoB.acquireRunLease('worker-b', 100, 60);

  assert.equal(leaseA.acquired, true);
  assert.equal(leaseB.acquired, false);

  await repoA.releaseRunLease('worker-a');
  const leaseC = await repoB.acquireRunLease('worker-b', 101, 60);
  assert.equal(leaseC.acquired, true);
});
