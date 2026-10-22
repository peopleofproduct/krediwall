# Integration guide — running Krediwall in production

How a lender or PSP embeds the engine, what breaks and what stays true.
The threat model is in [problem-statement.md](problem-statement.md); feed
files are in [feed-snapshot-format.md](feed-snapshot-format.md).

## Where it sits

```
payer app → PSP / lender switch → [ KREDIWALL: in-process verdict ] → NPCI → issuer
```

Two deployment shapes, same engine:

1. **In-process (library).** `new KrediwallAdapter(rules)` inside your
   switch/authorisation service. Zero network hops; verdict latency is the
   measured microsecond range in [README](../README.md#design-guardrails--and-what-we-measure).
2. **Sidecar (HTTP gateway).** `createHttpAdapter(adapter).listen(port)`
   gives `POST /v1/evaluate` and `GET /healthz`. The gateway validates
   request shape and caps bodies at 16 KB but has **no authentication or
   TLS** — bind it to a loopback/segmented interface and put your own
   network controls in front.

Whichever shape you pick, the verdict is synchronous: ALLOW, REVIEW or
BLOCK with per-rule reasons and `elapsedMicros`.

## Failure behaviour

- **A throwing rule is isolated.** It is skipped, recorded in
  `evaluation.ruleErrors`, and reported through the `onRuleError` hook.
  One broken rule can never crash the pipeline — but it *can* silently
  degrade coverage, so alert on a non-empty `ruleErrors` or on
  `onRuleError` firing.
- **Malformed transactions get REVIEW, never a silent ALLOW.** Non-finite
  amounts/timestamps or wrong-typed fields short-circuit the rules and
  flag themselves in `ruleErrors`.
- **Missing signals degrade gracefully.** No `geoCell` → the geo leg of
  velocity-spike is skipped. Payee VPA not a phone number → feed checks
  don't apply. Unchecked is reported, not hidden.

## The audit seam (compliance)

```ts
const engine = new FirewallEngine(rules, {
  onEvaluation: (evaluation, txn) => myAuditQueue.push({ evaluation, txn }),
  onRuleError: (rule, err) => alerting.increment('rule_error', { rule }),
});
```

`onEvaluation` is called **synchronously** on the hot path: hand the record
to your own queue or writer and return — do not do I/O in the callback. A
throwing hook is caught and counted in `engine.hookErrorCount` (nonzero =
dropped audit records; alert on it). RBI's fraud-risk directions expect
EWS fed from operating systems and FMR filings; `complianceHooks()` in
`@krediwall/enterprise-proxy` encodes the CERT-In 6-hour and FMR 14-day
deadlines as helpers. Automated reporting is a separate commercial module.

## Restarts, replicas and warm-up

Rule state is per-credit-line history held in memory. On restart it is
empty: velocity and drain rules **under-count** until windows refill —
expect up to `windowMs` of reduced sensitivity per line on a cold start.

Two mitigations, both supported:

- **Snapshot transfer.** `engine.exportState()` returns a JSON-safe
  `{ version, exportedAtMs, rules }` document; `restoreState()` on a fresh
  instance reloads it, preserving LRU order and ring contents. Store the
  snapshot wherever you like (file, object store, Redis) — the engine
  never writes anywhere itself. The seam is deliberately *not* exposed on
  the HTTP route: state contains hashed identifiers and does not belong
  on a network surface.
- **Warm replicas.** Run N stateless replicas behind the switch; a replica
  that starts cold just sees less history for its first window. Velocity
  windows are short (default 60 s) so warm-up cost is bounded.

Snapshot size scales with tracked lines — at defaults, up to ~140 MB of
ring state for 100k lines; serialise on a maintenance cadence, not per
transaction.

## Feed operations

- Produce `fri-latest.json` (format above) from your DIP/FRI feed on your
  own cadence, then `loadFriSnapshotFile` on a refresh loop or on file
  change. Keyed-HMAC digests: keep `FRI_HMAC_KEY` in a secret store, and
  rotate by ingesting with the new key (lookups must use the same key as
  the ingest).
- Monitor `result.stale` and `result.rejected`. A jump in rejections means
  the upstream translator broke; a stale flag means the feed stopped.

## Limits you should know

| Limit | Behaviour at the edge |
|---|---|
| `maxTrackedLines` (default 100k per rule) | LRU eviction — evicted lines restart their history, briefly weakening rules on them. |
| Ring capacity (default 32 txns/line) | Oldest in-window entries drop; drain burn under-counts (errs toward not flagging). |
| Out-of-order timestamps | Tolerated; a stale entry can hide a newer one behind it → window counts under-report. |
| `ruleErrors` non-empty | Degraded coverage — the verdict may be weaker than designed. Treat as an ops alert. |
| Graph seam | No evaluator wired → `checked: false`. Do not interpret as "clean". |

## What this does not give you

No ML scoring, no case management, no device signals, no consortium data —
see README's "What Krediwall does not do (yet)" and
[executive-summary.md](executive-summary.md). The starter thresholds are
illustrative; calibrate on replayed production traffic before trusting
BLOCK rates.
