# Krediwall

**An open-source, in-process fraud firewall for credit-funded UPI payments.**
Krediwall (*credit + wall* — a checkpoint on the credit lane, a Panini project) scores each authorisation as `ALLOW`, `REVIEW` or `BLOCK` using signals only a lender has — credit limit, utilisation, credit-line age — before the money moves.

| | |
|---|---|
| **What it is** | A TypeScript library plus a small HTTP gateway that runs *inside your process*, with a design target of under 5 ms per verdict. |
| **Who it's for** | Lenders (banks, small finance banks, NBFCs) that fund UPI payments from credit lines or RuPay credit cards, and the fintech apps that front them. |
| **What it is not** | Not an ML platform, not a case-management or AML suite, and not a replacement for NPCI's fraud monitoring. It adds lender-side credit context to what you already run. |
| **Maturity** | **Alpha.** Rules and thresholds are illustrative and not tuned on production data. Not yet published to npm. |

## The problem in one paragraph

When a savings-account UPI payment is fraudulent, the victim loses their own balance. When a **credit-funded** UPI payment is fraudulent, the loss is the **lender's capital** — and UPI is push-and-final, so there is no later chance to pull it back. Credit Line on UPI (CLOU) and RuPay credit cards on UPI put lender-funded money on a real-time rail, and mule networks can empty a fresh credit line quickly. Generic UPI and card fraud systems do not see credit-line state such as the sanctioned limit, how much of it has been burned in the last minute, or how new the line is. Krediwall does. Read the longer [problem statement](docs/problem-statement.md).

## See it work in 10 seconds

```bash
npm ci
npm run demo
```

```
2. Fresh credit line sprayed across many payees in seconds
  +   4s  BLOCK     ₹9,000  payee 5
            5 distinct payee VPAs in 60000ms (limit 4)  (48 µs)

3. Repeat large tickets to unverified terminals drain ~100% of the limit
  +   7s  BLOCK    ₹49,999  unverified terminal
            100.0% of limit burned via 2 repeat band tickets to unverified terminal  (23 µs)
```

## How a verdict is produced

```
 UPI app / PSP / lender switch
        │  one authorisation: payer & payee VPA, amount, credit limit,
        │  credit-line age, terminal-verified flag, optional geo cell
        ▼
 ┌─ KrediwallAdapter (library)  or  POST /v1/evaluate (HTTP gateway) ─────────┐
 │  FirewallEngine runs rules in order and stops at the first BLOCK           │
 │    • velocity-spike  — too many distinct payees / places inside a window   │
 │    • mule-drain      — repeat tickets burning most of the limit            │
 │    • feed-reputation — payee mobile number flagged in a fraud-feed snapshot│
 │    • your own rules  — implement the `Rule` interface                      │
 └──────────────▶  ALLOW | REVIEW | BLOCK  + reasons + elapsedMicros  ────────┘
```

Request and response over HTTP:

```jsonc
// POST /v1/evaluate
{ "txnId": "t-1", "creditLineId": "line-42", "payerVpa": "user@okbank",
  "payeeVpa": "pos1@ybl", "amountPaise": 4999900, "creditLimitPaise": 10000000,
  "timestampMs": 1760000000000, "terminalVerified": false }

// 200 OK
{ "verdict": "BLOCK",
  "hits": [{ "rule": "telemetry.mule-drain", "verdict": "BLOCK",
             "reason": "100.0% of limit burned via 2 repeat band tickets to unverified terminal" }],
  "elapsedMicros": 23.4 }
```

## Repository layout

```
packages/
├── core/               @krediwall/core             evaluation loop and verdict types
├── telemetry-rules/    @krediwall/telemetry-rules  velocity-spike and mule-drain rules, ring buffers, LRU map
├── dpi-adapters/       @krediwall/dpi-adapters     adapters for Digital Public Infrastructure fraud feeds (DoT FRI)
└── enterprise-proxy/   @krediwall/enterprise-proxy open adapter + HTTP gateway + compliance deadline helpers,
                                                   plus stubs where commercial modules plug in
examples/demo.mjs       npm run demo
benchmarks/run.mjs      npm run bench
```

*DPI here means Digital Public Infrastructure (India's public rails), not deep packet inspection.* Packages are workspace-local for now; `npm install @krediwall/...` will work once they are published.

```ts
import { KrediwallAdapter, createHttpAdapter } from '@krediwall/enterprise-proxy';
import { creditOnUpiRules } from '@krediwall/telemetry-rules';

const adapter = new KrediwallAdapter(creditOnUpiRules());
createHttpAdapter(adapter).listen(8080);
```

## Design guardrails — and what we measure

- **Latency target: under 5 ms per verdict.** It is an engineering budget we chose so the in-process check is negligible next to the network hops around it; it is not a regulatory figure. `npm run bench` (2M evaluations over 100k credit lines, starter rule set, single thread) measured, on a Linux x64 cloud VM (8 vCPU Intel Xeon, Node 24), **p50 ≈ 0.9 µs, p99 ≈ 2.6–2.9 µs, p99.9 ≈ 6.7–7.4 µs**; across three runs 0–1 of 2M evaluations exceeded 5 ms (worst case 3.8–5.3 ms) and 23–37 exceeded 1 ms. On a heavily loaded laptop the p99 was 9–15 µs and rare outliers reached tens of ms alongside V8 garbage-collection pauses. It is a measurement, not a hard real-time guarantee; run it on your own hardware.
- **Zero runtime dependencies** in `core` and `telemetry-rules`; everything uses Node built-ins.
- **Allocation-light, bounded state.** Rules keep per-credit-line history in fixed-size typed-array rings (about 1.4 KB per tracked line at default settings) and the set of tracked lines is LRU-capped (`maxTrackedLines`, default 100,000). Each call still allocates a couple of small objects; it is not allocation-free.
- **Failure isolation and an audit seam.** A rule that throws is skipped, recorded in `evaluation.ruleErrors` and surfaced via an `onRuleError` hook — it cannot take the pipeline down, and its absence is visible. `onEvaluation` emits every verdict for your audit queue; malformed transactions return REVIEW, never a silent ALLOW.
- **Restart-safe.** `exportState()`/`restoreState()` carry per-line history across restarts and replica warm-ups — see the [integration guide](docs/integration-guide.md).
- **Data minimisation, not a privacy guarantee.** Rules keep 32-bit bucket hashes instead of raw VPAs. That is a fast bucketing hash, not cryptographic — low-entropy identifiers can be recovered by dictionary search. Fraud-feed lookups use keyed HMAC digests. Everything runs in your process; the library logs nothing and sends nothing. None of this is a compliance certification.
- **Open core.** The engine, starter rules and open adapters are Apache-2.0. Graph-network scoring and automated regulatory reporters are not in this repository; the stubs are integration seams.

## What Krediwall does not do (yet)

- No machine-learning scoring, device or behavioural-biometric signals, or consortium data.
- No case management, alert queue or analyst workflow.
- The starter thresholds are illustrative; there is no public labelled dataset to tune them on, so calibrate against your own traffic.
- Fraud feeds are snapshots you supply. DoT's FRI is keyed by **mobile number** and delivered to onboarded stakeholders through the Digital Intelligence Platform; this library does not call any government API, and the feed rule only applies to payees whose VPA is a phone number.
- Merchant-side signals (MCC risk, terminal reputation) are limited to a verified/unverified flag.

## Documentation

- [Executive summary](docs/executive-summary.md) — one page for risk, fraud and product leads
- [Problem statement](docs/problem-statement.md) — the threat model and why credit-funded UPI is different
- [Integration guide](docs/integration-guide.md) — production deployment, restarts, HA, feeds and limits
- [Feed snapshot format](docs/feed-snapshot-format.md) — the FRI/DIP JSON file the loader accepts
- [Market opportunity](docs/market-opportunity.md) — volumes, fraud data and timing, with citations
- [Commercial strategy](docs/commercial-strategy.md) — open-core split and pricing
- [Glossary](docs/glossary.md) — CLOU, VPA, PSP, TPAP, FRI, DIP, EWS, FMR and more

## Project

- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Trademarks](TRADEMARKS.md) · [NOTICE](NOTICE)
- *Naming:* **Panini** is the umbrella for People of Product's open-source work for India's digital public infrastructure (see the sibling Panini project). **Krediwall** is this product.

## License

Apache-2.0 — see [LICENSE](LICENSE). Copyright 2026 Kapil. Maintained by [People of Product](https://github.com/peopleofproduct)™. The Apache licence does not grant any trademark rights; see [TRADEMARKS.md](TRADEMARKS.md).
