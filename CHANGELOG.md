# Changelog

All notable changes to Krediwall. The project is pre-1.0 alpha; minor
versions may break APIs until a 1.0 is cut.

## Unreleased

### Added

- **Reference deployment** — `examples/reference-gateway.mjs` runs the
  whole stack from environment variables: rules from a JSON config, FRI
  snapshot feed, restart warm-up via a state file, graceful shutdown and
  `GET /metrics`.
- **Observability** — `engine.metrics` lifetime counters (evaluations,
  verdicts, per-rule hits and errors), `engine.ruleStats()` exposing
  rule-internal counters (tracked/evicted lines), `LruMap.evictedCount`,
  and `renderPrometheus` plus `GET /metrics` on the HTTP gateway.
- **`degraded` flag** on `Evaluation` — true when the verdict was
  computed with malformed input or a throwing rule.
- **State file helpers** — `writeStateFile`/`readStateFile` (atomic
  temp-file + rename) and `adapter.saveStateToFile`/`restoreStateFromFile`.
- **Ruleset config loader** — `loadRulesConfigFile` in
  `@krediwall/telemetry-rules` builds rules from a strictly validated
  JSON file so thresholds can change without a deploy.
- Publish readiness: per-package README and LICENSE copies.
- **Feed coverage beyond phone VPAs** — snapshot rows may carry `vpa`
  identifiers (namespaced digests, matched via `feed.lookupVpa`) and
  `feedReputationRule` accepts a `resolveMobile` seam so an integrator's
  merchant registry can map handles to mobiles.
- `examples/translate-dip-export.mjs` — converts common DIP export shapes
  (CSV, JSON array, NDJSON) into the strict snapshot format.

## 0.1.0 — first tagged state

- Core engine with rule-order evaluation, first-BLOCK short-circuit,
  rule-failure isolation (`ruleErrors`, `onRuleError`) and a synchronous
  `onEvaluation` audit hook.
- Starter rules: `velocitySpike`, `muleDrain`; bounded per-line state in
  ring buffers behind an LRU cap; `exportState`/`restoreState` snapshots.
- DPI adapters: `InMemoryFeed` keyed-HMAC lookup and
  `loadFriSnapshotFile` with strict validation and staleness reporting.
- Enterprise proxy: `KrediwallAdapter`, HTTP gateway
  (`POST /v1/evaluate`, `GET /healthz`), `GraphEvaluator` contract,
  compliance deadline helpers, billing meter.
- `examples/demo.mjs`, `benchmarks/run.mjs`, docs set (problem statement,
  market opportunity, commercial strategy, integration guide, feed
  snapshot format, glossary).
