# Panini Vayu (पाणिनि वायु)

**High-velocity fraud firewall for Credit-on-UPI** — an open-source, zero-runtime-dependency, in-memory transaction evaluation engine that returns `ALLOW` / `REVIEW` / `BLOCK` verdicts in **under 5 milliseconds**, inside the UPI authorization window.

Vayu (वायु — *wind, velocity*) targets the fraud vector unique to **Credit Line on UPI (CLOU)** and **RuPay credit cards on UPI**: when a mule network drains a freshly sanctioned credit line, the money lost is the *lender's capital*, not the customer's deposit — and it is gone in the ~200ms it takes UPI to settle.

## Why this exists

- UPI now clears **~24 billion transactions a month** (~₹29.4 lakh crore, September 2026) — and fraud is scaling faster than volumes: **16.29 lakh incidents and ₹1,226 crore reported in FY 2025–26** (partial year), up from 4.07 lakh / ₹242 crore in FY 2021–22 (Ministry of Finance, Rajya Sabha).
- Credit on UPI just went from pilot to rollout: Karnataka Bank (with Navi) and Suryoday SFB (with Paytm) are live, and **HDFC, Axis and Kotak are reportedly preparing launches** — while RBI has **directed** banks to integrate real-time fraud signals (DoT's Financial Fraud Risk Indicator, June 2025 advisory).
- Card-network fraud engines assume hundreds of milliseconds and card-scheme telemetry; UPI engines were built for deposit debits. Neither was designed for *credit velocity* — a credit line can be drained 90%+ inside 60 seconds by repeat just-under-threshold tickets to unverified mule terminals.

## Repository layout

```
packages/
├── core/               @vayu/core             — evaluation loop, verdict types (zero deps)
├── telemetry-rules/    @vayu/telemetry-rules  — velocity-spike & mule-drain heuristics,
│                                                 fixed-size ring buffers (zero deps)
├── dpi-adapters/       @vayu/dpi-adapters     — Chakshu / FRI fraud-feed connectors
└── enterprise-proxy/   @vayu/enterprise-proxy — switch-pipeline adapter, HTTP front,
                                                 stubs for paid graph/billing features
```

## Quickstart

```bash
npm ci
npm run build   # tsc -b across all workspaces
npm test        # jest — all 4 suites must pass
```

```ts
import { VayuAdapter } from '@vayu/enterprise-proxy';
import { creditOnUpiRules } from '@vayu/telemetry-rules';
import { createHttpAdapter } from '@vayu/enterprise-proxy';

const adapter = new VayuAdapter(creditOnUpiRules());
createHttpAdapter(adapter).listen(8080);
// POST /v1/evaluate {txn…} → {verdict: "ALLOW"|"REVIEW"|"BLOCK", hits, elapsedMicros}
```

## Design guardrails

- **Sub-5ms verdicts** — synchronous rules, short-circuit on first `BLOCK`, no allocation on the clean path (enforced in `packages/core/tests/firewall.test.ts`).
- **Zero runtime dependencies** in `core` and `telemetry-rules` — native typed-array data structures only.
- **Bounded memory** — per-entity state lives in fixed-capacity rings; no per-transaction heap growth under sustained load.
- **PII-safe telemetry** — VPAs and geo cells are stored as non-reversible hashes; feed lookups use salted digests. Aligned with RBI data-sovereignty expectations.
- **Open-core** — the engine and heuristics are Apache-2.0; graph-network scoring and billing metering are stubbed seams for the commercial tier.

## Documentation

- [Problem statement](docs/problem-statement.md) — the Credit-on-UPI threat model, the 200ms constraint, and why existing fraud stacks miss it
- [Market opportunity](docs/market-opportunity.md) — UPI scale, CLOU inflection, fraud losses, and why now, with citations

## Status

Early scaffold — Phase 1/2 complete (engine + first heuristics + proxy stubs + CI). Interfaces may change before `0.1.0` stabilises.

## License

Apache-2.0 — see [LICENSE](LICENSE). Maintained by [People of Product](https://github.com/peopleofproduct).
