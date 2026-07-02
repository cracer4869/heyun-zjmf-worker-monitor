import { runMonitorOnce } from './monitor.js';
import { KVRepository } from './kv-repository.js';
import { handleRequest } from './routes.js';

function resolveKv(env = {}) {
  return env.ZJMF_KV || env.KV || env.EDGEONE_KV
    || globalThis.ZJMF_KV || globalThis.KV || globalThis.EDGEONE_KV;
}

export function edgeOneTcpConnector(host, port) {
  void host;
  void port;
  return Promise.reject(new Error('EdgeOne Pages 暂不支持 TCP 原生端口探测，请改用 HTTP(S) 或 API 检测'));
}

function buildEnv(env = {}) {
  const repo = new KVRepository(resolveKv(env));
  return {
    ...env,
    __repo: repo,
    tcpConnector: edgeOneTcpConnector,
    fetcher: env.fetcher || ((input, init) => fetch(input, init)),
  };
}

function createLeaseOwner(now) {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `edgeone-direct-${now}-${randomPart}`;
}

export async function handleEdgeOneRequest(request, env = {}) {
  return handleRequest(request, buildEnv(env));
}

export async function runEdgeOneMonitor(env = {}) {
  const edgeEnv = buildEnv(env);
  const now = Math.floor(Date.now() / 1000);
  const leaseOwner = createLeaseOwner(now);
  if (typeof edgeEnv.__repo.acquireRunLease === 'function') {
    const lease = await edgeEnv.__repo.acquireRunLease(leaseOwner, now, 600);
    if (!lease.acquired) return { checked: 0, skipped: true, reason: 'RUN_IN_PROGRESS', owner: lease.owner, expires_at: lease.expires_at };
  }
  try {
    return runMonitorOnce({
      repo: edgeEnv.__repo,
      fetcher: edgeEnv.fetcher,
      tcpConnector: edgeOneTcpConnector,
      now,
    });
  } finally {
    if (typeof edgeEnv.__repo.releaseRunLease === 'function') await edgeEnv.__repo.releaseRunLease(leaseOwner);
  }
}
