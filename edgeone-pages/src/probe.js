export function statusMatches(status, rule = '200-399') {
  return String(rule || '200-399')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const range = part.match(/^(\d{3})-(\d{3})$/);
      if (range) return status >= Number(range[1]) && status <= Number(range[2]);
      return status === Number(part);
    });
}

function timeoutMs(server, fallback = 10000) {
  const value = Number(server.probe_timeout_ms || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function errorMessage(error) {
  return error?.name === 'AbortError' ? '探测超时' : String(error?.message || error || '探测失败');
}

export async function checkHttpHealth({ server, fetcher }) {
  const started = Date.now();
  const url = server.http_url || server.check_target || '';
  if (!url) return { ok: false, statusValue: 'HTTP 未配置', error: '缺少 HTTP URL', latencyMs: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(server));
  try {
    const res = await fetcher(url, { method: server.http_method || 'GET', signal: controller.signal });
    const ok = statusMatches(res.status, server.http_expected_status || '200-399');
    return {
      ok,
      statusValue: `HTTP ${res.status}`,
      error: ok ? '' : `状态码不匹配：${res.status}`,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { ok: false, statusValue: 'HTTP ERROR', error: errorMessage(error), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

async function defaultTcpConnector(host, port, timeout) {
  throw new Error(`EdgeOne TCP connector 未注入：${host}:${port} (${timeout}ms)`);
}

export async function checkTcpHealth({ server, connector = defaultTcpConnector }) {
  const started = Date.now();
  const host = server.tcp_host || server.check_target || '';
  const port = Number(server.tcp_port || 0);
  if (!host || !port) return { ok: false, statusValue: 'TCP 未配置', error: '缺少 TCP 主机或端口', latencyMs: 0 };
  try {
    const ok = await connector(host, port, timeoutMs(server, 5000));
    return {
      ok: Boolean(ok),
      statusValue: `TCP ${port} ${ok ? 'open' : 'closed'}`,
      error: ok ? '' : 'TCP 端口不可达',
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = errorMessage(error);
    if (message.includes('不支持')) {
      return { ok: false, statusValue: 'TCP 不支持', error: message, latencyMs: Date.now() - started };
    }
    return { ok: false, statusValue: `TCP ${port} closed`, error: message, latencyMs: Date.now() - started };
  }
}
