# Commercial Strategy: Open-Core Firewall for Credit-on-UPI

> How the free engine spreads through the ecosystem while the paid tier sells
> compliance depth and network intelligence.

## 1. The open-core split

```
┌──────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│   OPEN CORE: @vayu/telemetry-rules       │    │   PAID TIER: ENTERPRISE GATEWAY          │
│        (Apache-2.0, free adoption)       │    │      (utility SaaS + on-prem license)    │
├──────────────────────────────────────────┤    ├──────────────────────────────────────────┤
│  • In-memory velocity & heuristics       │    │  • Multi-hop mule-ring graph checks      │
│  • FirewallEngine + verdict types        │    │  • CERT-In / FMR automated reporters     │
│  • Chakshu / FRI feed adapters           │    │  • Managed on-prem cluster updates       │
│  • Community rule patches                │    │  • EWS/RFA integration depth + audits    │
└──────────────────────────────────────────┘    └──────────────────────────────────────────┘
```

The open core is deliberately complete enough to be *useful* — a fintech can
drop `VayuAdapter` into a switch pipeline today. What it cannot give you is
the intelligence layer above single-transaction heuristics: graph-network
scoring of recipient rings, jurisdiction-grade audit trails, and managed
compliance reporting.

## 2. Pricing matrix

| Tier | Target client | Mechanics |
|---|---|---|
| **Open-Core Engine** | Early-stage fintech apps & indie developers | **₹0 (Apache-2.0).** Local eval loop, in-memory velocity formulas, standard schema profiles. |
| **TSP Managed Transit** | High-volume digital NBFCs & neo-lenders | **Utility transaction fee.** ₹0.05–₹0.15 per routed evaluation, capped dynamically on monthly volume commits. |
| **On-Prem Vault** | Scheduled commercial banks (SBI, HDFC, ICICI) | **Flat enterprise license.** ₹12L–₹45L per year per air-gapped node cluster, incl. managed software updates and audit guarantees. |

The utility tier is priced below a bank's marginal cost of a single mule
drain: at ₹0.05–0.15/evaluation, ₹1 crore of monthly utility covers ~7–20
crore evaluations — while one undetected fresh-line drain burns an entire
₹60,000–₹1,00,000 limit in seconds.

## 3. SRO alignment: the Sahamati play

In **June 2026** the RBI recognised the **Sahamati Foundation as the
Self-Regulatory Organisation (SRO)** for India's Account Aggregator
ecosystem — the first cross-sectoral SRO spanning multiple financial
regulators (RBI, SEBI, IRDAI, PFRDA), chaired by former RBI deputy governor
R. Gandhi. [1] The AA network it governs already includes **1,120+ regulated
entities, 176 FIPs, 1,020 FIUs and 17 AAs**, moving ~290 million consented
data shares a month. [2]

Strategic implications for Vayu:

- **Standards shaping.** SROs write the operational/technical baseline for
  the ecosystem. Submitting Vayu's open telemetry-rule schema for SRO
  evaluation positions it as a candidate baseline protocol for high-velocity
  credit protection — the way ReBIT and AA-grade schemas became
  industry defaults.
- **Institutional trust shortcut.** Aligning the engine's data-privacy
  posture (hashed VPAs, in-memory-only evaluation, no raw telemetry egress)
  with SRO guidelines substitutes for per-bank security audits — critical
  for reaching the smaller banks that "lack understanding of the product". [3]
- **Fraud-check adjacency.** The AA framework already performs consent-based
  data sharing for underwriting, collections and *fraud checks* [4] — Vayu's
  feed-reputation and EWS-signal layer is a natural complement inside the
  same data-consent envelope.

## 4. Regulatory hooks → paid features

| Mandate | Window | Vayu surface |
|---|---|---|
| RBI Fraud Master Directions: EWS integrated with CBS/ops systems | Continuous, synchronous | `Rule` hits → EWS trigger stream (open) |
| FMR portal: fraud reporting to RBI | 14 days from classification | FMR draft generator (paid) |
| CERT-In s.70B(6) cyber-incident reporting | **6 hours** from notice | `certInReportDeadlineMs` → automated incident reporter (paid) |
| Limited-liability circular: 24×7 customer reporting | Continuous | Verdict telemetry API for SOC dashboards (paid) |
| DoT FRI integration advisory | Real-time API | `feedReputationRule` (open), managed feed sync (paid) |

The open-core `ComplianceHooks` stub in `packages/enterprise-proxy` encodes
these deadlines so the paid reporters slot in without API changes.

## 5. Why this model fits this market

- UPI infrastructure is bought, not sold — banks and TSPs integrate what the
  ecosystem already trusts. Open-core maximizes the surface area that
  becomes "the default".
- Utility pricing matches payment-switch economics (paise-per-txn mental
  model every NBFC CFO already uses).
- The on-prem tier exists because banks with air-gapped switch
  infrastructure cannot adopt SaaS — but they pay the most for
  audit-guaranteed determinism.

---

## Sources

1. Sahamati, *RBI Recognition of Sahamati as SRO — new phase for India's AA ecosystem*, 5 Jun 2026 — https://sahamati.org.in/media-article/rbi-sro-recognition-account-aggregator-ecosystem/
2. Business Standard, *RBI recognises Sahamati Foundation as SRO for account aggregator ecosystem*, Jun 2026 — https://www.business-standard.com/finance/news/rbi-recognises-sahamati-foundation-as-sro-for-account-aggregator-ecosystem-126060501286_1.html
3. Business Standard, *Unclear guidelines hold back growth of credit line on UPI since launch*, Oct 2025 — https://www.business-standard.com/finance/news/unclear-guidelines-hold-back-growth-of-credit-line-on-upi-since-launch-125100500501_1.html
4. The Economic Times, *RBI approves Sahamati as SRO for AA ecosystem*, Jun 2026 — https://economictimes.indiatimes.com/tech/technology/rbi-approves-sahamati-as-sro-for-account-aggregator-ecosystem/articleshow/131535777.cms
