# Integrating with DPIP (RBI's fraud-intelligence platform)

> **Living document.** This page tracks how Krediwall plugs into
> India's **Digital Payments Intelligence Platform (DPIP)** as public
> information about it arrives. Sections marked *pending* describe
> designed seams, not finished adapters — DPIP's API contract is only
> visible to onboarded institutions. Last updated: 31 October 2026.

## Where DPIP is today

| Phase | Status | What it does |
|---|---|---|
| **1 — Smart Registry** | Live since 1 Sep 2026 (8 banks live; ~25 more expected within two months + top 15 payment aggregators targeted by end-January) | Shared negative registry — entity flags for onboarding due diligence, beneficiary additions, profile changes, database scrubbing |
| **2 — Risk scoring** | Announced, not yet live | Real-time pre-transaction risk scores via API, trained on contributed multi-source data |

DPIP is operated by **IDPIC** (Indian Digital Payment Intelligence
Corporation), a neutral not-for-profit utility under the RBI mandate;
the RBI Innovation Hub built the prototype. Institutions contribute
fraud signals; connected risk context flows back — each institution
keeps its own decisions. See [market context](market-opportunity.md)
for the full comparison and sources.

## The integration model — one sentence that matters

**Krediwall never connects to DPIP directly. The lender's own DPIP
access lands inside Krediwall's seams.** Krediwall runs inside the
institution's perimeter and consumes intelligence the way it consumes
every feed — as a local contract. That keeps us out of the data-sharing
path entirely, and it is also why the pieces below are *seams*: each
one is finished on our side and waiting on the institution's access.

## Integration paths

### Path A — Smart Registry → `FraudFeed` *(ready — needs your DPIP extract)*

The registry's question — *"is this entity flagged?"* — is exactly
what our feed contract answers. A bank holding DPIP access turns its
registry view into a `FraudFeed` implementation; `feedReputationRule`
then scores it on every transaction alongside FRI and any internal
lists — same dedupe, same evidence shape, same µs budget.

Two shapes fit, depending on how the institution receives the registry:

- **Snapshot / periodic extract** → load rows into `InMemoryFeed`
  (the FRI pattern: keyed-HMAC digests, no raw identifiers at rest).
  `loadFriSnapshotFile` shows the validated format; a DPIP-shaped
  loader is a small variant of it.
- **Live lookup API** → implement `FraudFeed` over the bank's DPIP
  client. The interface already supports VPA-keyed entities
  (`lookupVpa`) for account-style registries, not just mobiles.

```ts
// What a bank's DPIP adapter looks like — the whole contract:
import type { FraudFeed, FeedEntry } from '@krediwall/dpi-adapters';

export class DpipRegistryFeed implements FraudFeed {
  readonly source = 'dpip';
  constructor(private readonly client: DpipClient /* institution's own access */) {}

  lookup(mobile: string): FeedEntry | null {
    return this.client.entityFlag({ mobile });   // → { listed, riskScore }
  }
  lookupVpa(vpa: string): FeedEntry | null {
    return this.client.entityFlag({ account: vpa });
  }
}
```

### Path B — Phase-2 risk score → adapter-layer prefetch *(design — pending DPIP API)*

A real-time scoring API is a network call — it does **not** belong
inside `engine.evaluate()` (synchronous, in-memory, µs). The
designed pattern puts it at the adapter layer:

```
txn → KrediwallAdapter
        ├─ engine.evaluate()            (µs, in-memory — the verdict)
        └─ dpipRiskScore()              (bounded-deadline prefetch, runs
                                         alongside / before evaluate)
verdict + attached DPIP context → switch
```

- **Deadline-bounded:** the score attaches when it arrives inside a
  configured budget; on timeout the verdict is not held.
- **Fail-mode configurable:** `failOpen` (verdict stands, score marked
  unavailable) vs `failClosed` on the REVIEW path — per-deployment
  policy, not a library default.
- **REVIEW-path enrichment** is the cheap first use: scores for the
  grey zone, where a few extra milliseconds are affordable anyway.

*Pending: DPIP Phase-2 API spec — request shape, auth model, SLA,
rate limits. When a participating institution shares it, this path
becomes a small `enterprise-proxy` module.*

### Path C — Contribution → decision log *(zero code today)*

Institutions contribute fraud signals upstream to DPIP. Krediwall's
`KREDIWALL_DECISION_LOG` already emits one JSON line per verdict
(verdict, rule hits, evidence, latency) — a blocked mule-drain
beneficiary is exactly the kind of signal a registry wants. Mapping
decision-log rows into the institution's contribution format is an
ops/reporting flow, not an engine feature.

## What we need from each stakeholder type

| You are | You bring | We bring |
|---|---|---|
| **Bank / NBFC on CLOU** | Your DPIP access (registry extract or client), your merchant-VPA→mobile resolver, labelled historical traffic for calibration | The engine, the feed contract, replay tooling, the gateway |
| **PSP / switch** | Per-lender feed wiring (each lender's DPIP access is theirs), multi-tenant config | The embeddable engine + HTTP adapter, per-tenant rulesets, metrics |
| **Fintech front-end** | Your lending partner — the feed access is the *bank's*, not yours | Same engine; verdicts flow to whoever runs the switch |

## Open questions — the info we're waiting on

*This list is the build-up surface; items move to Paths A/B as
answers arrive.*

1. **Entity schema** — does the registry key on account, VPA, mobile,
   or a composite? (Shapes `lookupVpa` vs `lookup` emphasis.)
2. **Access format** — extract file, streaming delta, or query API?
   Determines snapshot-loader vs live-feed implementation.
3. **Auth model** — mTLS/PKI, API key, or rail-side auth? Determines
   where credentials live in a deployment.
4. **Phase-2 scoring contract** — request/response schema, SLA,
   rate limits, and whether scores are entity-level or
   transaction-context-level.
5. **Contribution format** — the schema institutions use to report
   signals back; affects how we shape decision-log exports.
6. **Non-bank access** — whether NBFCs/PAs access directly or via a
   sponsor bank; affects who implements the feed.

## Status log

| Date | Event |
|---|---|
| 2026-09-01 | DPIP Smart Registry live — 8 banks pilot (IDPIC, GFF 2026) |
| 2026-10-31 | Integration document published; paths A–C mapped to public info |

*Corrections and inside-the-room details welcome via
`kapil@theproduct.city` — especially from institutions already
onboarded to DPIP.*
