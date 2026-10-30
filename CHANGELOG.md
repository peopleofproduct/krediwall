# Changelog

All notable changes to Krediwall. The project is pre-1.0 alpha; minor
versions may break APIs until a 1.0 is cut.

## 0.2.2 — public launch

The repository is now public. This release carries the launch-readiness
work: licence hygiene, adopter attribution programme, brand identity and
the visual documentation set.

### Added

- SPDX licence and copyright headers on every source file, so
  file-level copying carries attribution.
- Maintainer contact (`kapil@theproduct.city`) in the README,
  getting-started, integration guide, ADOPTERS, SECURITY and
  TRADEMARKS — an invitation to write before a pilot or production
  evaluation so the maintainers can support it. Voluntary, never a
  licence condition.
- **`NOTICE` ships in every package tarball** — Apache-2.0 §4(d)
  requires it in redistributions; `files: ["dist", "NOTICE"]` keeps it
  in while keeping sources out.
- Package metadata on all four packages: `engines.node >=18`,
  keywords for npm search, `author`, `bugs` and `homepage`.
- **Brand icon** at `docs/assets/krediwall-icon.svg` — the black
  masonry wall with one flagged brick — shown at the top of the README
  and embedded in the before/after, dedupe-retry and feed-lifecycle
  visuals. Referenced from `docs/brand-kit.md`, which still notes the
  "Secured by Krediwall" badge lockup is a separate design to come.
- **Mermaid diagrams, reviewable as code** (GitHub renders them natively):
  system-context map in the README (every stakeholder: payment path,
  credit signals, feed pipeline, audit trail, regulators as context),
  the verdict decision flowchart (replaces the old ASCII box), the
  authorization sequence and state/hot-reload lifecycle in the new
  `docs/architecture.md`, three deployment topologies plus restart
  warm-up in the integration guide, and a latency-budget visual in the
  README guardrails.
- **Marketing-grade SVGs in `docs/assets/`** — before/after comparison
  (README), open-core split (README + commercial strategy), six
  threat-pattern cards (README + problem statement), and the day-one
  adoption timeline (getting started), all linked from the docs.
- **Micro visuals for week-one education** — verdict-response anatomy
  (README), switch-retry dedupe (architecture), threshold calibration
  trade-off (getting started), and the feed-freshness lifecycle with
  the degraded path (integration guide + feed format doc).
- **`ADOPTERS.md`** — voluntary, tiered adopter listing (name only /
  name + logo / case study), revocable at any time; Apache-2.0
  requires no disclosure and the engine does no usage tracking.
- **`docs/brand-kit.md`** — the "Secured by Krediwall" badge licence
  (we grant adopters running the engine in production a scoped,
  revocable right to display it) plus the opt-in press-reference option
  (adopters may grant us name/logo/case-study rights with joint
  disclosure review and 30-day revocability). Neither is implied by
  adoption.
- `TRADEMARKS.md` — badge-programme carve-out; explicit that adopter
  marks are only ever used under separate opt-in.
- `docs/commercial-strategy.md` — "Adoption and attribution" section
  (passive NOTICE-based, voluntary open-tier and contractual paid-tier
  lanes; Verified Deployment certification; anonymized benchmark
  report).

### Changed

- Brand icon switched to the black masonry variant; the embeds in
  `before-after.svg`, `dedupe-retry.svg` and `feed-lifecycle.svg`
  recoloured to match.
- Pricing figures removed from `docs/commercial-strategy.md` — the tier
  structure stays public, specific prices don't; published ceilings
  anchor negotiations.
- `SECURITY.md` no longer says the project is unpublished (npm packages
  are live).
- `docs/publishing.md` now documents the clean-build step before
  packing — incremental `tsc -b` had left a deleted source's compiled
  artifact in `dist/` which would have shipped in the tarball.

### Fixed

- The integration guide no longer claims the gateway has "no
  authentication" — bearer auth (`KREDIWALL_API_KEY`) shipped with the
  first release; the guide now shows it and keeps the honest note that
  the gateway terminates no TLS.

## 0.2.1 — npm ↔ GitHub linkage

### Added

- `repository`, `homepage` and `bugs` fields on all four published
  packages — npm package pages now link back to this GitHub repo
  (with the correct package subdirectory), so anyone landing on npm
  finds the source, the README and the issue tracker.
- npm version badges on the README, and the maturity note now says the
  packages are published (it predated the 0.1.0 release).

## 0.2.0 — operational completeness

Republished all four `@krediwall/*` packages to the npm registry.

### Added

- **Feed auto-refresh** — `KREDIWALL_FRI_REFRESH_MS` re-loads the FRI
  snapshot into the same feed instance on a cadence; a failed refresh
  keeps serving the previous snapshot and surfaces on `/readyz`, so a
  bad delivery degrades coverage instead of blanking the watchlist.
- **Threshold hot-reload** — `SIGHUP` re-reads the ruleset config and
  refreshes the feed without a restart. `FirewallEngine.replaceRules`
  (and `KrediwallAdapter.replaceRules`) carry per-line history across
  the swap for same-named rules; a config that fails validation is
  ignored and the running ruleset keeps serving; the dedupe window
  survives the swap. Verified live: tightened velocity blocks on the
  next evaluation using pre-reload history.
- **Java client example** — `examples/clients/EvaluateExample.java`,
  zero dependencies (java.net.http), compile-checked in CI.
- **CI docker job** — builds the gateway image, validates the compose
  stack, then exercises auth, feed SIGHUP hot-reload, ruleset SIGHUP
  hot-reload and the auto-refresh loop end to end in a container.

## 0.1.0 — first release, published to npm

`@krediwall/core`, `@krediwall/telemetry-rules`, `@krediwall/dpi-adapters`
and `@krediwall/enterprise-proxy` live on the public registry. Verified
end to end from a clean directory: `npm install` (zero vulnerabilities —
no runtime dependencies), construct an adapter, run a velocity-spike
scenario and get a BLOCK verdict with structured evidence.

### Added

- Core engine with rule-order evaluation, first-BLOCK short-circuit,
  rule-failure isolation (`ruleErrors`, `onRuleError`) and a synchronous
  `onEvaluation` audit hook.
- Starter rules `velocitySpike` and `muleDrain`; bounded per-line state
  in ring buffers behind an LRU cap; `exportState`/`restoreState`
  snapshots. DPI adapters: `InMemoryFeed` keyed-HMAC lookup and
  `loadFriSnapshotFile` with strict validation and staleness reporting.
  Enterprise proxy: `KrediwallAdapter`, HTTP gateway, `GraphEvaluator`
  contract, compliance deadline helpers, billing meter.
- **Four detection rules** — `firstPayee` (first-seen payee drawing a
  large limit fraction), `dormantReactivation` (line reactivating after
  a dormant window), `structuring` (repeat tickets clustered under a
  band) and `oddHours` (activity in a configurable IST night band on a
  line with no history there). All bounded state, all
  `exportState`/`restoreState`, all configurable via `rulesFromConfig`.
- **Structured evidence** — every `RuleHit` may carry an `evidence`
  record (counts, ratios, hours) alongside the human-readable `reason`,
  for audit trails and FMR-style defence documentation.
- **Transaction deduplication** — `FirewallEngine({ dedupeCapacity })`
  returns the original `Evaluation` for a repeated `txnId` without
  re-running rules, so switch retries cannot double-count rule state.
- **Latency histogram** — `engine.metrics.latencyMicros` records
  cumulative histogram buckets rendered as a Prometheus histogram on
  `GET /metrics`.
- **Readiness** — `GET /readyz` returns 200/503 from the adapter's
  optional `readinessProbe`, so orchestrators can hold traffic until
  feed state and warm-up are usable.
- **`npm run replay`** — `tools/replay.mjs` replays a labelled JSONL
  transaction stream and reports per-rule hits, a confusion matrix,
  catch rate, false-positive rate and latency — the harness for
  calibrating thresholds against real traffic. Sample fixture:
  `examples/fixtures/replay-sample.jsonl`.
- **Gateway hardening** — optional bearer auth (`KREDIWALL_API_KEY`,
  constant-time compare, probes stay open), strict transport validation
  of all eight required fields with the offending field named in the
  400, and an `x-request-id` header echoed/generated on every response.
- **`docs/api/openapi.yaml`** — the full OpenAPI 3.1 contract for
  `/v1/evaluate`, `/healthz`, `/readyz` and `/metrics`.
- **Decision trail** — `KREDIWALL_DECISION_LOG` appends one JSON line
  per evaluation (verdict, evidence, latency) via a buffered stream;
  `tools/decisions-report.mjs` turns a log into a review summary.
- **Reference deployment** — `examples/reference-gateway.mjs` runs the
  whole stack from environment variables: rules from a JSON config, FRI
  snapshot feed, restart warm-up via a state file, graceful shutdown and
  `GET /metrics`.
- **Feed coverage beyond phone VPAs** — snapshot rows may carry `vpa`
  identifiers (namespaced digests, matched via `feed.lookupVpa`) and
  `feedReputationRule` accepts a `resolveMobile` seam so an integrator's
  merchant registry can map handles to mobiles.
  `examples/translate-dip-export.mjs` converts common DIP export shapes
  (CSV, JSON array, NDJSON) into the strict snapshot format.
- **Deploy stack** — `deploy/`: multi-stage non-root `Dockerfile`,
  docker-compose with Prometheus + Grafana auto-provisioned, a
  `k8s.yaml` reference (liveness/readiness probes wired), a Grafana
  dashboard JSON and a Prometheus alert pack (rule errors, dropped
  audit records, latency budget, evictions, BLOCK-rate anomaly).
- **State file helpers** — `writeStateFile`/`readStateFile` (atomic
  temp-file + rename) and `adapter.saveStateToFile`/`restoreStateFromFile`.
- **Ruleset config loader** — `loadRulesConfigFile` builds rules from a
  strictly validated JSON file so thresholds can change without a deploy.
- **Observability** — `engine.metrics` lifetime counters,
  `engine.ruleStats()` per-rule internals, `LruMap.evictedCount`,
  `renderPrometheus` plus `GET /metrics`.
- **`degraded` flag** on `Evaluation` — true when the verdict was
  computed with malformed input or a throwing rule.
- **Publishing path** — per-package `prepublishOnly` compile guards,
  root `npm run publish:check` and `docs/publishing.md`.
- **`docs/getting-started.md`** — the full walkthrough in plain words:
  nine steps from `npm run demo` through the gateway, API key, fraud
  feed, dashboard, replay calibration and the decision trail.
