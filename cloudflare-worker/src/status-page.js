function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtTime(seconds) {
  if (!seconds) return '从未';
  return new Date(seconds * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function stateLabel(state) {
  const labels = {
    healthy: '运行正常',
    suspect: '疑似异常',
    down: '确认宕机',
    rebooting: '正在重启',
    recovering: '恢复中',
  };
  return labels[state] || '未知';
}

function isIpAddress(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim());
}

function displayName(server) {
  return isIpAddress(server.name) || isIpAddress(server.ip) ? `服务器 #${server.id}` : server.name;
}

function row(server) {
  const state = server.state || 'unknown';
  const safeName = escapeHtml(displayName(server));
  const safeProvider = escapeHtml(server.provider);
  const safeStatus = escapeHtml(server.last_status_value || 'N/A');
  return `<article class="card card--${state}">
    <div class="card__top">
      <div>
        <p class="eyebrow">#${escapeHtml(server.id)} · ${safeProvider}</p>
        <h2>${safeName}</h2>
      </div>
      <span class="pill">${stateLabel(state)}</span>
    </div>
    <dl class="metrics">
      <div><dt>API 状态</dt><dd>${safeStatus}</dd></div>
      <div><dt>最后检查</dt><dd>${fmtTime(server.last_check_time)}</dd></div>
      <div><dt>最后重启</dt><dd>${fmtTime(server.last_reboot_time)}</dd></div>
      <div><dt>今日重启</dt><dd>${server.reboot_count_today ?? 0} 次</dd></div>
    </dl>
  </article>`;
}

export function renderStatusPage(servers) {
  const healthy = servers.filter((s) => s.state === 'healthy').length;
  const problem = servers.length - healthy;
  const cards = servers.length ? servers.map(row).join('') : '<p class="empty">暂无启用的监控服务器。</p>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ZJMF 服务器监控</title>
  <style>
    :root{--bg:#f8f4ea;--panel:#fffdf8;--ink:#172033;--muted:#647084;--line:#dfd6c8;--ok:#0f9f6e;--bad:#d84657;--warn:#b87503;--cyan:#176b87}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;background:radial-gradient(circle at 15% 10%,#fff7df 0,transparent 32%),radial-gradient(circle at 85% 0,#e9f6f3 0,transparent 28%),linear-gradient(160deg,var(--bg),#fff 58%,#efe7d8);color:var(--ink);font-family:"Bahnschrift","Aptos Display","Trebuchet MS",sans-serif}
    body:before{content:"";position:fixed;inset:0;background-image:linear-gradient(rgba(23,32,51,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(23,32,51,.055) 1px,transparent 1px);background-size:38px 38px;mask-image:linear-gradient(to bottom,#000,transparent 88%);pointer-events:none}
    main{position:relative;width:min(1120px,calc(100% - 36px));margin:0 auto;padding:54px 0}
    .hero{display:grid;grid-template-columns:1.4fr .8fr;gap:24px;align-items:end;margin-bottom:26px}
    .tag{display:inline-flex;gap:8px;align-items:center;color:var(--cyan);letter-spacing:.22em;font-size:12px;text-transform:uppercase}
    h1{font-size:clamp(36px,7vw,82px);line-height:.92;margin:14px 0 12px;letter-spacing:-.07em}
    .lead{color:var(--muted);font-size:17px;line-height:1.7;margin:0;max-width:640px}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .stat{padding:18px;border:1px solid var(--line);background:rgba(255,253,248,.88);backdrop-filter:blur(14px);border-radius:22px;box-shadow:0 14px 40px rgba(67,51,25,.1)}
    .stat b{display:block;font-size:30px}.stat span{color:var(--muted);font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:18px}
    .card{border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,253,248,.96),rgba(255,255,255,.9));box-shadow:0 22px 70px rgba(67,51,25,.13);border-radius:28px;padding:22px;animation:rise .5s ease both}
    .card--healthy{border-color:rgba(15,159,110,.34)}.card--down,.card--recovering,.card--rebooting{border-color:rgba(216,70,87,.38)}
    .card__top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.eyebrow{margin:0 0 8px;color:var(--muted);font-size:12px;letter-spacing:.08em} h2{margin:0;font-size:26px}
    .pill{white-space:nowrap;border-radius:999px;padding:8px 12px;background:rgba(15,159,110,.11);color:var(--ok);border:1px solid rgba(15,159,110,.28);font-size:13px}.card--recovering .pill,.card--rebooting .pill{background:rgba(184,117,3,.12);color:var(--warn);border-color:rgba(184,117,3,.28)}.card--down .pill{background:rgba(216,70,87,.12);color:var(--bad);border-color:rgba(216,70,87,.28)}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0 0}.metrics div{padding:14px;border-radius:18px;background:#f3eee5}dt{color:var(--muted);font-size:12px}dd{margin:6px 0 0;font-weight:700;word-break:break-all}.empty{padding:28px;border:1px dashed var(--line);border-radius:22px;color:var(--muted)}
    footer{margin-top:26px;color:var(--muted);font-size:13px}.api{color:var(--cyan);text-decoration:none}
    @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}@media(max-width:760px){.hero{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div><span class="tag">ZJMF Monitor</span><h1>核云服务器<br>自动监控</h1><p class="lead">Cloudflare Worker 每 5 分钟检查魔方财务 API；发现异常后按状态机确认并执行硬重启。</p></div>
      <div class="summary"><div class="stat"><b>${servers.length}</b><span>监控项</span></div><div class="stat"><b>${healthy}</b><span>正常</span></div><div class="stat"><b>${problem}</b><span>异常/恢复中</span></div></div>
    </section>
    <section class="grid">${cards}</section>
    <footer>数据接口：<a class="api" href="/api/status">/api/status</a></footer>
  </main>
</body>
</html>`;
}
