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
//   KREDIWALL_VPA_REGISTRY  optional JSON map {"merchant@paytm":"9876543210"}
//                           resolving non-phone payee VPAs to mobiles
//   KREDIWALL_STATE_FILE    engine-state file for restart warm-up
//   KREDIWALL_STATE_SAVE_MS   save cadence when a state file is set (default 60s)
//   KREDIWALL_API_KEY       require `Authorization: Bearer <key>` on
//                           /v1/evaluate and /metrics (unset = open)
//   KREDIWALL_DECISION_LOG  JSONL decision trail, one line per evaluation —
//                           the record your review queue / FMR defence is
//                           built from (see tools/decisions-report.mjs)
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

// --- rules ---------------------------------------------------------------
const rules = env('KREDIWALL_RULES_CONFIG')
  ? loadRulesConfigFile(env('KREDIWALL_RULES_CONFIG'))
  : creditOnUpiRules();
console.log(
  `rules: ${rules.map((r) => r.name).join(', ')}` +
    (env('KREDIWALL_RULES_CONFIG') ? ` (from ${env('KREDIWALL_RULES_CONFIG')})` : ' (preset defaults)'),
);

// --- fraud feed -----------------------------------------------------------
let feedStale = false;
const snapshotPath = env('KREDIWALL_FRI_SNAPSHOT');
if (snapshotPath !== undefined) {
  const key = env('KREDIWALL_FRI_HMAC_KEY');
  if (key === undefined) {
    console.error('KREDIWALL_FRI_HMAC_KEY is required when KREDIWALL_FRI_SNAPSHOT is set');
    process.exit(1);
  }
  const feed = friFeed(key);
  const result = loadFriSnapshotFile(feed, snapshotPath, {
    maxAgeMs: Number(env('KREDIWALL_FRI_MAX_AGE_MS') ?? 6 * 3_600_000),
  });
  feedStale = result.stale;
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
  rules.push(feedReputationRule([feed], 0.7, { resolveMobile }));
  console.log(
    `feed: ${result.loaded} numbers loaded, ${result.rejected} rejected` +
      (result.stale ? ' — STALE snapshot, check the upstream pipeline' : ''),
  );
}

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
  readinessProbe: () => (feedStale ? ['fri snapshot older than maxAgeMs'] : []),
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
