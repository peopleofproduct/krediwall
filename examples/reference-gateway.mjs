// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

// Reference deployment: a complete, copyable Krediwall gateway.
//
//   npm run build && node examples/reference-gateway.mjs
//
// Wires every production seam in one file — rules from a JSON config,
// an FRI snapshot feed, engine-state persistence across restarts,
// graceful shutdown, and /healthz + /metrics for ops. Configuration is
// entirely through environment variables:
//
//   PORT                    listen port (default 8080)
//   KREDIWALL_RULES_CONFIG  ruleset JSON (see loadRulesConfigFile);
//                           unset → the creditOnUpiRules() preset
//   KREDIWALL_FRI_SNAPSHOT  FRI snapshot JSON (docs/feed-snapshot-format.md)
//   KREDIWALL_FRI_HMAC_KEY  key for feed digests; required with the snapshot
//   KREDIWALL_FRI_MAX_AGE_MS  flag the load stale past this age (default 6h)
//   KREDIWALL_FRI_REFRESH_MS  re-load the snapshot on this cadence; a failed
//                           refresh keeps serving the previous contents
//   KREDIWALL_VPA_REGISTRY  optional JSON map {"merchant@paytm":"9876543210"}
//                           resolving non-phone payee VPAs to mobiles
//   KREDIWALL_STATE_FILE    engine-state file for restart warm-up
//   KREDIWALL_STATE_SAVE_MS   save cadence when a state file is set (default 60s)
//   KREDIWALL_API_KEY       require `Authorization: Bearer <key>` on
//                           /v1/evaluate and /metrics (unset = open)
//   KREDIWALL_DECISION_LOG  JSONL decision trail, one line per evaluation —
//                           the record your review queue / FMR defence is
//                           built from (see tools/decisions-report.mjs)
//
// Signals: SIGINT/SIGTERM save state and drain; SIGHUP hot-reloads the
// ruleset config and refreshes the feed without losing per-line history
// (rule names are the stable key). A bad config on SIGHUP keeps the old
// ruleset serving.
import { createRequire } from 'node:module';
import { createWriteStream, existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { KrediwallAdapter, createHttpAdapter } = require('@krediwall/enterprise-proxy');
const { creditOnUpiRules, loadRulesConfigFile } = require('@krediwall/telemetry-rules');
const { feedReputationRule, friFeed, loadFriSnapshotFile } = require('@krediwall/dpi-adapters');

const env = (name) => process.env[name];
const port = Number(env('PORT') ?? 8080);
const statePath = env('KREDIWALL_STATE_FILE');
const saveEveryMs = Number(env('KREDIWALL_STATE_SAVE_MS') ?? 60_000);

// --- fraud feed -----------------------------------------------------------
// The feed object is created once; every refresh re-loads the snapshot
// file into the SAME instance (ingest replaces its contents), so the
// feed rule's captured reference stays valid across refreshes. A failed
// refresh keeps serving the previous snapshot — a feed hiccup must not
// blank the watchlist.
const snapshotPath = env('KREDIWALL_FRI_SNAPSHOT');
const friMaxAgeMs = Number(env('KREDIWALL_FRI_MAX_AGE_MS') ?? 6 * 3_600_000);
let feed;
if (snapshotPath !== undefined) {
  const key = env('KREDIWALL_FRI_HMAC_KEY');
  if (key === undefined) {
    console.error('KREDIWALL_FRI_HMAC_KEY is required when KREDIWALL_FRI_SNAPSHOT is set');
    process.exit(1);
  }
  feed = friFeed(key);
}

// Optional merchant-registry resolver: maps non-phone payee VPAs to
// their onboarding mobile. In production this is your merchant DB, not
// a file — the seam is identical.
let resolveMobile;
const registryPath = env('KREDIWALL_VPA_REGISTRY');
if (registryPath !== undefined) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  resolveMobile = (vpa) => registry[vpa] ?? null;
  console.log(`registry: ${Object.keys(registry).length} VPA→mobile entries`);
}

let feedStale = false;
let feedError = null;
const refreshFeed = () => {
  if (feed === undefined) return;
  try {
    const result = loadFriSnapshotFile(feed, snapshotPath, { maxAgeMs: friMaxAgeMs });
    feedStale = result.stale;
    feedError = null;
    console.log(
      `feed: ${result.loaded} identifiers loaded, ${result.rejected} rejected` +
        (result.stale ? ' — STALE snapshot, check the upstream pipeline' : ''),
    );
  } catch (e) {
    feedError = e.message;
    console.error(`feed: refresh failed: ${e.message} — serving the previous snapshot`);
  }
};
refreshFeed();

const refreshMs = Number(env('KREDIWALL_FRI_REFRESH_MS') ?? 0);
if (feed !== undefined && refreshMs > 0) {
  setInterval(refreshFeed, refreshMs).unref();
  console.log(`feed: auto-refresh every ${Math.round(refreshMs / 1000)}s (KREDIWALL_FRI_REFRESH_MS)`);
}

// --- rules ---------------------------------------------------------------
// Rebuilt on boot and on every SIGHUP. Rule names are the stable key:
// replaceRules carries per-line history across a reload for any rule
// whose name survives, so threshold changes never restart fraud history.
const rulesConfigPath = env('KREDIWALL_RULES_CONFIG');
const buildRules = () => {
  const base =
    rulesConfigPath !== undefined
      ? loadRulesConfigFile(rulesConfigPath)
      : creditOnUpiRules();
  if (feed !== undefined) base.push(feedReputationRule([feed], 0.7, { resolveMobile }));
  return base;
};
const rules = buildRules();
console.log(
  `rules: ${rules.map((r) => r.name).join(', ')}` +
    (rulesConfigPath !== undefined ? ` (from ${rulesConfigPath})` : ' (preset defaults)'),
);

// --- adapter + restart warm-up -------------------------------------------
// readinessProbe powers GET /readyz: a stale feed is a degraded-not-dead
// state, surfaced to the load balancer rather than hidden in logs. The
// engine dedupe window absorbs switch retries so replays can't double-count.
const decisionLogPath = env('KREDIWALL_DECISION_LOG');
let decisionStream;
if (decisionLogPath !== undefined) {
  // Buffered appends: the onEvaluation hook must never block the hot path,
  // so it hands the line to a write stream and returns. In production swap
  // this for your own queue/writer — the seam is identical. The log stays
  // inside your perimeter and contains raw VPAs: treat it like payment data.
  decisionStream = createWriteStream(decisionLogPath, { flags: 'a' });
  console.log(`decision log: appending to ${decisionLogPath}`);
}
const adapter = new KrediwallAdapter(rules, {
  engine: {
    dedupeCapacity: 10_000,
    onEvaluation: (evaluation, txn) => {
      if (decisionStream === undefined) return;
      const record = {
        atMs: Date.now(),
        txnId: txn.txnId,
        creditLineId: txn.creditLineId,
        payerVpa: txn.payerVpa,
        payeeVpa: txn.payeeVpa,
        amountPaise: txn.amountPaise,
        creditLimitPaise: txn.creditLimitPaise,
        verdict: evaluation.verdict,
        degraded: evaluation.degraded,
        elapsedMicros: evaluation.elapsedMicros,
        hits: evaluation.hits,
        ruleErrors: evaluation.ruleErrors,
      };
      decisionStream.write(JSON.stringify(record) + '\n');
    },
  },
  readinessProbe: () => {
    const problems = [];
    if (feedStale) problems.push('fri snapshot older than maxAgeMs');
    if (feedError !== null) problems.push(`fri refresh failed: ${feedError}`);
    return problems;
  },
});
if (statePath !== undefined && existsSync(statePath)) {
  try {
    adapter.restoreStateFromFile(statePath);
    console.log(`state: restored from ${statePath}`);
  } catch (e) {
    console.warn(`state: could not restore (${e.message}) — starting cold`);
  }
}
if (statePath !== undefined) {
  const timer = setInterval(() => {
    try {
      adapter.saveStateToFile(statePath);
    } catch (e) {
      console.error(`state: save failed: ${e.message}`);
    }
  }, saveEveryMs);
  timer.unref(); // never keep the process alive just for state saving
}

// --- HTTP surface ---------------------------------------------------------
const apiKey = env('KREDIWALL_API_KEY');
const server = createHttpAdapter(adapter, apiKey !== undefined ? { apiKey } : undefined);
server.listen(port, () => {
  console.log(
    `listening on :${port}  — POST /v1/evaluate · GET /healthz · GET /readyz · GET /metrics` +
      (apiKey !== undefined ? ' (Bearer auth on /v1/evaluate and /metrics)' : ''),
  );
});

const shutdown = (signal) => {
  console.log(`\n${signal}: saving state and draining…`);
  if (statePath !== undefined) {
    try {
      adapter.saveStateToFile(statePath);
    } catch (e) {
      console.error(`state: final save failed: ${e.message}`);
    }
  }
  if (decisionStream !== undefined) decisionStream.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Hot-reload: SIGHUP re-reads the ruleset config and refreshes the feed
// without dropping per-line history (rule names are the stable key — see
// FirewallEngine.replaceRules). A bad config file NEVER takes the running
// gateway down: the old ruleset keeps serving and the error is logged.
process.on('SIGHUP', () => {
  try {
    const next = buildRules();
    refreshFeed();
    adapter.replaceRules(next);
    console.log(`SIGHUP: ruleset reloaded — ${next.map((r) => r.name).join(', ')}`);
  } catch (e) {
    console.error(`SIGHUP: reload failed (${e.message}) — keeping the current ruleset`);
  }
});
