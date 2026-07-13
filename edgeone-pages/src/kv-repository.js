import { DEFAULT_SETTINGS } from './constants.js';
import { createRuntime } from './state-machine.js';

const LEGACY_STATE_KEY = 'zjmf_monitor_state';
const SETTINGS_KEY = 'zjmf_monitor_settings';
const PROVIDERS_KEY = 'zjmf_monitor_providers';
const SERVERS_KEY = 'zjmf_monitor_servers';
const RUNTIMES_KEY = 'zjmf_monitor_runtimes';
const EVENTS_KEY = 'zjmf_monitor_events';
const CHECK_RESULTS_KEY = 'zjmf_monitor_check_results';
const META_KEY = 'zjmf_monitor_meta';
const RUN_LEASE_KEY = 'zjmf_monitor_run_lease';

function numberSetting(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolSetting(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

function percent(ok, total) {
  const count = Number(total || 0);
  if (count <= 0) return '0.000%';
  return `${((Number(ok || 0) / count) * 100).toFixed(3)}%`;
}

function defaultState() {
  return {
    settings: {},
    providers: [],
    servers: [],
    runtimes: {},
    events: [],
    check_results: [],
    next_event_id: 1,
    next_check_id: 1,
  };
}

function normalizeState(raw) {
  return { ...defaultState(), ...(raw && typeof raw === 'object' ? raw : {}) };
}

function defaultMeta() {
  return {
    next_event_id: 1,
    next_check_id: 1,
  };
}

async function kvGetJson(kv, key) {
  const value = await kv.get(key);
  if (!value) return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function kvPutJson(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export class KVRepository {
  constructor(kv) {
    if (!kv?.get || !kv?.put) throw new Error('EdgeOne KV 未绑定，请配置 ZJMF_KV 或 KV 环境变量');
    this.kv = kv;
  }

  async readLegacyState() {
    return normalizeState(await kvGetJson(this.kv, LEGACY_STATE_KEY));
  }

  async readSection(key, legacyField, fallback) {
    const value = await kvGetJson(this.kv, key);
    if (value !== null && value !== undefined) return value;
    const legacy = await this.readLegacyState();
    return legacyField ? (legacy[legacyField] ?? fallback) : fallback;
  }

  async writeSection(key, value) {
    await kvPutJson(this.kv, key, value);
  }

  async readMeta() {
    const meta = await kvGetJson(this.kv, META_KEY);
    if (meta && typeof meta === 'object') {
      return {
        next_event_id: Number(meta.next_event_id || 1),
        next_check_id: Number(meta.next_check_id || 1),
      };
    }
    const legacy = await this.readLegacyState();
    return {
      next_event_id: Number(legacy.next_event_id || 1),
      next_check_id: Number(legacy.next_check_id || 1),
    };
  }

  settingsWithDefaults(raw = {}) {
    return {
      check_interval: numberSetting(raw.check_interval, DEFAULT_SETTINGS.check_interval),
      suspect_threshold: numberSetting(raw.suspect_threshold, DEFAULT_SETTINGS.suspect_threshold),
      reboot_cooldown: numberSetting(raw.reboot_cooldown, DEFAULT_SETTINGS.reboot_cooldown),
      recover_timeout: numberSetting(raw.recover_timeout, DEFAULT_SETTINGS.recover_timeout),
      recover_check_interval: numberSetting(raw.recover_check_interval, DEFAULT_SETTINGS.recover_check_interval),
      api_timeout: numberSetting(raw.api_timeout, DEFAULT_SETTINGS.api_timeout),
      default_daily_reboot_limit: numberSetting(raw.default_daily_reboot_limit, DEFAULT_SETTINGS.default_daily_reboot_limit),
      reboot_limit_window: raw.reboot_limit_window || DEFAULT_SETTINGS.reboot_limit_window,
      data_retention_days: numberSetting(raw.data_retention_days, DEFAULT_SETTINGS.data_retention_days),
      recover_success_threshold: numberSetting(raw.recover_success_threshold, DEFAULT_SETTINGS.recover_success_threshold),
      admin_overview_range: raw.admin_overview_range || DEFAULT_SETTINGS.admin_overview_range,
      admin_monitor_range: raw.admin_monitor_range || DEFAULT_SETTINGS.admin_monitor_range,
      site_title: raw.site_title || DEFAULT_SETTINGS.site_title,
      site_description: raw.site_description || DEFAULT_SETTINGS.site_description,
      webhook_name: raw.webhook_name || DEFAULT_SETTINGS.webhook_name,
      webhook_url: raw.webhook_url || '',
      webhook_type: raw.webhook_type || 'custom',
      webhook_timeout: numberSetting(raw.webhook_timeout, DEFAULT_SETTINGS.webhook_timeout),
      webhook_headers: raw.webhook_headers || DEFAULT_SETTINGS.webhook_headers,
      webhook_template: raw.webhook_template || DEFAULT_SETTINGS.webhook_template,
      notify_failure_silence: boolSetting(raw.notify_failure_silence, DEFAULT_SETTINGS.notify_failure_silence),
      pushplus_token: raw.pushplus_token || '',
      notify_token: raw.notify_token || raw.pushplus_token || DEFAULT_SETTINGS.notify_token,
      notify_target: raw.notify_target || DEFAULT_SETTINGS.notify_target,
      notify_secret: raw.notify_secret || DEFAULT_SETTINGS.notify_secret,
      timezone: raw.timezone || DEFAULT_SETTINGS.timezone,
      setup_completed: raw.setup_completed || '0',
    };
  }

  async getSettings() {
    return this.settingsWithDefaults(await this.readSection(SETTINGS_KEY, 'settings', {}));
  }

  async getSetting(key, fallback = '') {
    const settings = await this.readSection(SETTINGS_KEY, 'settings', {});
    return settings[key] ?? fallback;
  }

  async setSetting(key, value) {
    const settings = await this.readSection(SETTINGS_KEY, 'settings', {});
    settings[key] = String(value);
    await this.writeSection(SETTINGS_KEY, settings);
  }

  async listEnabledServers() {
    return (await this.listServers()).filter((server) => server.enabled);
  }

  async listServers() {
    const servers = await this.readSection(SERVERS_KEY, 'servers', []);
    return servers.map((server) => ({ ...server, enabled: server.enabled !== false }));
  }

  async getServer(id) {
    return (await this.listServers()).find((server) => String(server.id) === String(id)) || null;
  }

  async listProviders() {
    const providers = await this.readSection(PROVIDERS_KEY, 'providers', []);
    return [...providers].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async getProvider(name) {
    return (await this.listProviders()).find((provider) => provider.name === name) || null;
  }

  async updateProvider(provider) {
    const providers = await this.readSection(PROVIDERS_KEY, 'providers', []);
    const index = providers.findIndex((item) => item.name === provider.name);
    if (index >= 0) {
      providers[index] = { ...providers[index], ...provider, updated_at: Math.floor(Date.now() / 1000) };
      await this.writeSection(PROVIDERS_KEY, providers);
    }
  }

  async upsertProvider(provider, now) {
    const providers = await this.readSection(PROVIDERS_KEY, 'providers', []);
    const next = { ...provider, created_at: provider.created_at || now, updated_at: now };
    const index = providers.findIndex((item) => item.name === provider.name);
    if (index >= 0) providers[index] = { ...providers[index], ...next };
    else providers.push(next);
    await this.writeSection(PROVIDERS_KEY, providers);
  }

  async upsertServer(server, now) {
    const servers = await this.readSection(SERVERS_KEY, 'servers', []);
    const next = { ...server, enabled: server.enabled !== false, created_at: server.created_at || now, updated_at: now };
    const index = servers.findIndex((item) => String(item.id) === String(server.id));
    if (index >= 0) servers[index] = { ...servers[index], ...next };
    else servers.push(next);
    await this.writeSection(SERVERS_KEY, servers);
  }

  async deleteServer(id) {
    const servers = await this.readSection(SERVERS_KEY, 'servers', []);
    const runtimes = await this.readSection(RUNTIMES_KEY, 'runtimes', {});
    const nextServers = servers.filter((server) => String(server.id) !== String(id));
    delete runtimes[String(id)];
    await Promise.all([
      this.writeSection(SERVERS_KEY, nextServers),
      this.writeSection(RUNTIMES_KEY, runtimes),
    ]);
  }

  async resetTutorialData() {
    const settings = await this.readSection(SETTINGS_KEY, 'settings', {});
    const nextSettings = {};
    if (settings.admin_token_hash) nextSettings.admin_token_hash = settings.admin_token_hash;
    await Promise.all([
      this.writeSection(SETTINGS_KEY, nextSettings),
      this.writeSection(PROVIDERS_KEY, []),
      this.writeSection(SERVERS_KEY, []),
      this.writeSection(RUNTIMES_KEY, {}),
      this.writeSection(EVENTS_KEY, []),
      this.writeSection(CHECK_RESULTS_KEY, []),
      this.writeSection(META_KEY, defaultMeta()),
    ]);
  }

  async getRuntime(serverId) {
    const runtimes = await this.readSection(RUNTIMES_KEY, 'runtimes', {});
    const row = runtimes[String(serverId)];
    return row ? createRuntime(row) : null;
  }

  async saveRuntime(serverId, runtime) {
    const runtimes = await this.readSection(RUNTIMES_KEY, 'runtimes', {});
    runtimes[String(serverId)] = runtime;
    await this.writeSection(RUNTIMES_KEY, runtimes);
  }

  async addEvent(event) {
    const events = await this.readSection(EVENTS_KEY, 'events', []);
    const meta = await this.readMeta();
    events.push({ id: meta.next_event_id++, ...event });
    await Promise.all([
      this.writeSection(EVENTS_KEY, events.slice(-500)),
      this.writeSection(META_KEY, meta),
    ]);
  }

  async addCheckResult(result) {
    const checkResults = await this.readSection(CHECK_RESULTS_KEY, 'check_results', []);
    const meta = await this.readMeta();
    checkResults.push({ id: meta.next_check_id++, ...result, ok: Boolean(result.ok) });
    await Promise.all([
      this.writeSection(CHECK_RESULTS_KEY, checkResults.slice(-3000)),
      this.writeSection(META_KEY, meta),
    ]);
  }

  async pruneCheckResults(retentionDays, now = Math.floor(Date.now() / 1000)) {
    const days = Number(retentionDays || 0);
    if (!Number.isFinite(days) || days <= 0) return;
    const before = Math.floor(now - days * 24 * 60 * 60);
    const checkResults = await this.readSection(CHECK_RESULTS_KEY, 'check_results', []);
    await this.writeSection(CHECK_RESULTS_KEY, checkResults.filter((row) => Number(row.created_at || 0) >= before));
  }

  async listRecentChecks(serverId, limit = 60) {
    const checkResults = await this.readSection(CHECK_RESULTS_KEY, 'check_results', []);
    return checkResults
      .filter((row) => String(row.server_id) === String(serverId))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0))
      .slice(0, limit)
      .map((row) => ({ ok: Boolean(row.ok), latency_ms: Number(row.latency_ms || 0), created_at: Number(row.created_at || 0) }));
  }

  async countRecentReboots(serverId, since) {
    const events = await this.readSection(EVENTS_KEY, 'events', []);
    return events.filter((event) => String(event.server_id) === String(serverId)
      && event.old_state === 'down'
      && event.new_state === 'rebooting'
      && Number(event.created_at || 0) >= since).length;
  }

  async listStatus() {
    const [servers, runtimes, checkResults] = await Promise.all([
      this.readSection(SERVERS_KEY, 'servers', []),
      this.readSection(RUNTIMES_KEY, 'runtimes', {}),
      this.readSection(CHECK_RESULTS_KEY, 'check_results', []),
    ]);
    return servers.filter((server) => server.enabled !== false).map((server) => {
      const runtime = runtimes[String(server.id)] || {};
      const last = [...checkResults].reverse().find((row) => String(row.server_id) === String(server.id)) || {};
      return { ...server, ...runtime, last_latency_ms: Number(last.latency_ms || 0) };
    });
  }

  async listEvents(limit = 50) {
    const events = await this.readSection(EVENTS_KEY, 'events', []);
    return [...events].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).slice(0, limit);
  }

  async listDailyHistory(serverIds, days = 30, now = Math.floor(Date.now() / 1000)) {
    const checkResults = await this.readSection(CHECK_RESULTS_KEY, 'check_results', []);
    const since = now - days * 24 * 60 * 60;
    const grouped = new Map(serverIds.map((id) => [String(id), []]));
    const wanted = new Set(serverIds.map(String));
    const buckets = new Map();
    for (const row of checkResults.filter((item) => wanted.has(String(item.server_id)) && Number(item.created_at || 0) >= since)) {
      const date = new Date(Number(row.created_at || 0) * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const key = `${row.server_id}|${date}`;
      const bucket = buckets.get(key) || { server_id: String(row.server_id), date, total: 0, ok: 0, latency: 0 };
      bucket.total += 1;
      bucket.ok += row.ok ? 1 : 0;
      bucket.latency += Number(row.latency_ms || 0);
      buckets.set(key, bucket);
    }
    for (const bucket of buckets.values()) {
      grouped.get(bucket.server_id)?.push({
        date: bucket.date,
        checks: bucket.total,
        failures: Math.max(0, bucket.total - bucket.ok),
        uptime: percent(bucket.ok, bucket.total),
        avg_latency_ms: Math.round(bucket.latency / bucket.total),
        downtime_seconds: Math.max(0, bucket.total - bucket.ok) * 300,
      });
    }
    return grouped;
  }

  async listPublicEvents(serverIds, limit = 80) {
    const grouped = new Map(serverIds.map((id) => [String(id), []]));
    const wanted = new Set(serverIds.map(String));
    const events = (await this.listEvents(limit)).filter((event) => wanted.has(String(event.server_id)));
    for (const event of events) grouped.get(String(event.server_id))?.push(event);
    return grouped;
  }

  async acquireRunLease(owner, now = Math.floor(Date.now() / 1000), ttlSeconds = 600) {
    const lease = await kvGetJson(this.kv, RUN_LEASE_KEY);
    const leaseOwner = String(lease?.owner || '');
    const expiresAt = Number(lease?.expires_at || 0);
    if (leaseOwner && expiresAt > now && leaseOwner !== String(owner)) {
      return { acquired: false, owner: leaseOwner, expires_at: expiresAt };
    }
    const next = {
      owner: String(owner || 'edgeone-monitor'),
      acquired_at: now,
      expires_at: now + Math.max(1, Number(ttlSeconds || 600)),
    };
    await kvPutJson(this.kv, RUN_LEASE_KEY, next);
    const confirmed = await kvGetJson(this.kv, RUN_LEASE_KEY);
    if (String(confirmed?.owner || '') !== next.owner) {
      return { acquired: false, owner: String(confirmed?.owner || ''), expires_at: Number(confirmed?.expires_at || 0) };
    }
    return { acquired: true, ...next };
  }

  async releaseRunLease(owner) {
    const lease = await kvGetJson(this.kv, RUN_LEASE_KEY);
    const leaseOwner = String(lease?.owner || '');
    if (leaseOwner && owner && leaseOwner !== String(owner)) return false;
    await kvPutJson(this.kv, RUN_LEASE_KEY, null);
    return true;
  }
}
