# 核云监控审计问题修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复审计发现的 EdgeOne、Cloudflare、GitHub Actions 和公开状态接口问题，并以测试和线上只读探测验证。

**Architecture:** 保持现有 EdgeOne/Cloudflare 双实现的模块边界；EdgeOne 继续由 GitHub Actions 调度，Cloudflare Worker 保留手工部署入口。通过共享的状态机和仓储查询约束重启动作，通过路由层控制匿名数据字段。

**Tech Stack:** Node.js test runner、Cloudflare Workers/D1、EdgeOne Pages/KV、GitHub Actions、PowerShell/curl。

---

### Task 1: Restore EdgeOne build inputs

**Files:**
- Create: `edgeone-pages/src/notifier.js`
- Create: `edgeone-pages/src/probe.js`
- Create: `edgeone-pages/src/state-machine.js`
- Create: `edgeone-pages/src/time.js`
- Create: `edgeone-pages/src/zjmf-client.js`
- Create: `edgeone-pages/src/repository.js`
- Create: `edgeone-pages/src/status-page.js`
- Test: `edgeone-pages/test/*.test.js`

- [x] Copy the corresponding implementations from `upstream/main` and preserve the fork's current imports.
- [x] Run `node --test edgeone-pages/test/*.test.js` and verify the tests start before changing behavior.

### Task 2: Enforce failed-action limits

**Files:**
- Modify: `edgeone-pages/src/kv-repository.js`
- Modify: `edgeone-pages/src/monitor.js`
- Modify: `edgeone-pages/src/state-machine.js`
- Test: `edgeone-pages/test/monitor.test.js`

- [x] Add a failing test where a failed reboot attempt counts toward the configured window.
- [x] Make `countRecentReboots` count every `down -> rebooting` action event, not only successful recovery.
- [x] Run the focused test, then the full EdgeOne suite.

### Task 3: Separate business health from power state

**Files:**
- Modify: `edgeone-pages/src/monitor.js`
- Modify: `cloudflare-worker/src/monitor.js`
- Test: `edgeone-pages/test/monitor.test.js`
- Test: `cloudflare-worker/test/monitor.test.js`

- [x] Add failing tests for HTTP 504 plus API `on` remaining unhealthy.
- [x] Implement explicit service-health precedence while retaining power-on/reboot action selection.
- [x] Run both focused suites and then all tests.

### Task 4: Reduce scheduling and public data risk

**Files:**
- Modify: `.github/workflows/edgeone-monitor-cron.yml`
- Modify: `.github/workflows/edgeone-monitor-loop.yml`
- Modify: `.github/workflows/deploy.yml`
- Modify: `edgeone-pages/src/routes.js`
- Modify: `edgeone-pages/src/handler.js`
- Modify: `edgeone-pages/src/kv-repository.js`
- Test: `edgeone-pages/test/handler.test.js`
- Test: `edgeone-pages/test/kv-repository.test.js`

- [x] Add failing assertions for anonymous status field allowlisting and lease ownership.
- [x] Remove the duplicate private Cron workflow from the repository if present, and keep one bootstrap/loop chain.
- [x] Add security headers and minimize public fields.
- [x] Restrict deploy workflow permissions and pin action references to immutable SHAs where available.

### Task 5: Correct Cloudflare configuration and verify

**Files:**
- Modify: `cloudflare-worker/wrangler.toml`
- Modify: `cloudflare-worker/scripts/prepare-cloudflare.mjs`
- Modify: `.github/workflows/deploy.yml`
- Test: `cloudflare-worker/test/*.test.js`

- [x] Replace placeholder D1 binding with an environment-driven ID/name contract that fails clearly when absent.
- [x] Ensure the workflow does not send a `Bearer `-prefixed token to Wrangler.
- [x] Run all Node tests, YAML/static checks, and read-only endpoint probes.

### 收口验证记录（2026-07-13）

- 已完成 Task 1-5；首个修复提交为 `e2639dd5b6764503c5ca17e76691e6caa785563a`。
- EdgeOne 最终生产部署 `dpwca6148oxu` 已上线，公开状态字段与安全响应头已验证。
- 首轮 CodeQL 发现 `js/stack-trace-exposure`：通知网络异常的底层 `Error.message` 会经管理接口返回客户端。
- 已用回归测试复现并改为稳定错误码 `NOTIFICATION_FAILED`，避免暴露内部主机、端口或调用细节。
- Cloudflare 仅执行 dry-run；生产 Worker 发布及历史孤儿 D1 数据清理不在本次授权范围。
