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
//   KREDIWALL_STATE_FILE    engine-state file for restart warm-up
//   KREDIWALL_STATE_SAVE_MS   save cadence when a state file is set (default 60s)
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

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
  rules.push(feedReputationRule([feed]));
  console.log(
    `feed: ${result.loaded} numbers loaded, ${result.rejected} rejected` +
      (result.stale ? ' — STALE snapshot, check the upstream pipeline' : ''),
  );
}

// --- adapter + restart warm-up -------------------------------------------
const adapter = new KrediwallAdapter(rules);
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
const server = createHttpAdapter(adapter);
server.listen(port, () => {
  console.log(`listening on :${port}  — POST /v1/evaluate · GET /healthz · GET /metrics`);
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
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
