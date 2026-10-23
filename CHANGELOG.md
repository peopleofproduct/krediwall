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
- **Four new detection rules** — `firstPayee` (first-seen payee drawing a
  large limit fraction), `dormantReactivation` (line reactivating after a
  dormant window), `structuring` (repeat tickets clustered under a band)
  and `oddHours` (activity in a configurable IST night band on a line with
  no history there). All bounded state, all `exportState`/`restoreState`,
  all configurable via `rulesFromConfig`.
- **Structured evidence** — every `RuleHit` may carry an `evidence` record
  (counts, ratios, hours) alongside the human-readable `reason`, for
  audit trails and FMR-style defence documentation.
- **Transaction deduplication** — `FirewallEngine({ dedupeCapacity })`
  returns the original `Evaluation` for a repeated `txnId` without
  re-running rules, so switch retries cannot double-count rule state.
- **Latency histogram** — `engine.metrics.latencyMicros` records
  cumulative histogram buckets rendered as a Prometheus histogram on
  `GET /metrics`.
- **Readiness** — `GET /readyz` on the HTTP gateway returns 200/503 from
  the adapter's optional `readinessProbe`, so orchestrators can hold
  traffic until feed state and warm-up are usable.
- **`npm run replay`** — `tools/replay.mjs` replays a labelled JSONL
  transaction stream and reports per-rule hits, a confusion matrix,
  catch rate, false-positive rate and latency — the harness for calibrating
  thresholds against real traffic. Sample fixture:
  `examples/fixtures/replay-sample.jsonl`.
- **Gateway hardening** — optional bearer auth (`KREDIWALL_API_KEY`,
  constant-time compare, probes stay open), strict transport validation
  of all eight required fields with the offending field named in the 400,
  and an `x-request-id` header echoed/generated on every response.
- **`docs/api/openapi.yaml`** — the full OpenAPI 3.1 contract for
  `/v1/evaluate`, `/healthz`, `/readyz` and `/metrics`; import it into
  API gateways, Postman or client codegen.
- **Decision trail** — `KREDIWALL_DECISION_LOG` appends one JSON line per
  evaluation (verdict, evidence, latency) via a buffered stream;
  `tools/decisions-report.mjs` turns a log into a review summary.
- **`deploy/`** — `Dockerfile` (multi-stage, non-root), docker-compose
  with Prometheus + Grafana auto-provisioned, a `k8s.yaml` reference
  (liveness/readiness probes wired), a Grafana dashboard JSON and a
  Prometheus alert pack (rule errors, dropped audit records, latency
  budget, evictions, BLOCK-rate anomaly).
- **Publishing path** — per-package `prepublishOnly` compile guards,
  root `npm run publish:check` (pack dry-run) and `docs/publishing.md`
  (version-synced releases, provenance guidance, post-publish
  verification).
- **`docs/getting-started.md`** — the full walkthrough in plain words:
  nine steps from `npm run demo` through the gateway, API key, fraud
  feed, dashboard, replay calibration and the decision trail, each with
  the command, the expected output and what it means.

## 0.1.0 — published to npm

`@krediwall/core`, `@krediwall/telemetry-rules`, `@krediwall/dpi-adapters`
and `@krediwall/enterprise-proxy` 0.1.0 are live on the public registry.
Verified end to end from a clean directory: `npm install` (zero
vulnerabilities — no runtime dependencies), construct an adapter, run a
velocity-spike scenario and get a BLOCK verdict with structured
evidence. `.npmrc` added to `.gitignore` so local publish tokens can
never be committed.

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
