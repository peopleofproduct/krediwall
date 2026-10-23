# Commercial Strategy: Open-Core Firewall for Credit-Funded UPI

> How the free engine spreads through the ecosystem while the paid tier sells
> compliance depth and network intelligence.

## 1. The open-core split

```
┌──────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│   OPEN CORE (Apache-2.0, in this repo)   │    │   COMMERCIAL MODULES (not in this repo)  │
├──────────────────────────────────────────┤    ├──────────────────────────────────────────┤
│  • FirewallEngine + verdict types        │    │  • Multi-hop mule-ring graph scoring     │
│  • Velocity-spike and mule-drain rules   │    │  • Automated CERT-In / FMR reporters     │
│  • FRI feed adapter (mobile-keyed)       │    │  • Managed feed ingestion for            │
│  • KrediwallAdapter + HTTP gateway       │    │    DIP-onboarded customers               │
│  • Compliance deadline helpers (stubs)   │    │  • Managed on-prem updates, audit pack   │
│  • Community rule patches                │    │  • Support, SLAs, certifications         │
└──────────────────────────────────────────┘    └──────────────────────────────────────────┘
```

The open core is deliberately complete enough to be *useful*: a fintech can
drop `KrediwallAdapter` into a service today. What it cannot give you is the
intelligence layer above single-transaction heuristics — graph scoring of
recipient rings, jurisdiction-grade audit trails, managed compliance
reporting, and a vendor accountable for them.

## 2. Pricing model (working hypothesis)

Tier structure is public; specific figures are priced on engagement and
deliberately not published — published ceilings anchor customer
negotiations to our maximum, not our value.

| Tier | Target client | Mechanics |
|---|---|---|
| **Open-Core Engine** | Early-stage fintech apps and indie developers | **₹0 (Apache-2.0).** In-process eval loop, starter rules, open adapters. |
| **Managed Transit (hosted)** | High-volume digital NBFCs, neo-lenders and the PSP/TPAP apps that front them | **Utility transaction fee.** Paise-per-routed-evaluation, capped dynamically on monthly volume commits. |
| **On-Prem Vault** | Scheduled commercial banks and large lenders | **Flat enterprise licence.** Per air-gapped node cluster, incl. managed updates and audit guarantees. |

Larger lenders usually already run an enterprise fraud suite, so the on-prem
tier is positioned as a **complementary pre-authorisation sidecar** carrying
credit-line context, not as a replacement for that suite.

The economic rationale in one line: at a paise-level per-evaluation fee,
preventing a single full credit-line drain covers hundreds of thousands
of evaluations — the fee is a rounding error next to the fraud loss it
prevents.

*Terminology.* "PSP" is a UPI Payment Service Provider (the sponsor bank) and
"TPAP" a Third-Party Application Provider (a UPI app). We avoid "TSP": in the
DoT sources cited here it means Telecom Service Provider.

## 3. Licensing and what actually protects the business

The code is **Apache-2.0**. That licence maximises adoption — banks' legal
teams accept it and anyone can embed it — but it does not by itself protect
revenue:

- Anyone may host or resell the open core, and may keep their modifications
  private. A hosted tier built only from open code has no licence moat.
- Apache-2.0 §6 grants **no trademark rights**. Any protection for the
  project and maintainer names depends on registration and enforcement (see
  [TRADEMARKS.md](../TRADEMARKS.md)).
- Contributions arrive under the same licence, so relicensing later needs each
  contributor's consent. Until a CLA is in place the project does not accept
  outside code ([CONTRIBUTING.md](../CONTRIBUTING.md)).

So the defensible parts are **not** the open code:

1. **Data and network effects** — a mule-ring graph that improves with every
   participating lender.
2. **Compliance deliverables** — audited, supported FMR/CERT-In reporting.
3. **Trust and accountability** — certifications, SLAs and a named vendor.
4. **Brand** — the registered marks.
5. **Private commercial modules** — their implementations stay out of this
   repository; only stubs and interfaces are public.

## 4. Where standards bodies fit

In June 2026 the RBI recognised the **Sahamati Foundation as the
Self-Regulatory Organisation (SRO) for the Account Aggregator (AA)
ecosystem**, chaired by former RBI deputy governor R. Gandhi, covering 1,120+
regulated entities and ~290 million data shares a month. [1][2]

Its relevance to Krediwall is **indirect**. The SRO governs AA data sharing —
which lenders use for underwriting and fraud checks [3] — not UPI payment
fraud or credit-line standards. It is a possible adjacency if Krediwall rules
ever consume AA data, not a current route to standard-setting or a
substitute for bank security reviews. The bodies that matter more for
credit-funded UPI fraud are NPCI, RBI's payment-systems department and
DoT/I4C (through the Digital Intelligence Platform).

## 5. Regulatory hooks → product surface

| Mandate | Window | Krediwall surface |
|---|---|---|
| RBI Fraud Master Directions: EWS integrated with CBS/ops systems | Continuous, synchronous | `Rule` hits → EWS trigger stream (open) |
| FMR portal: fraud reporting to RBI | 14 days from classification | FMR draft generator (commercial) |
| CERT-In s.70B(6) cyber-incident reporting | **6 hours** from notice | `certInReportDeadlineMs` helper (open) → automated reporter (commercial) |
| Limited-liability circular: 24×7 customer reporting | Continuous | Verdict telemetry API for SOC dashboards (commercial) |
| DoT FRI integration advisory | Real-time via DIP | `feedReputationRule` (open); managed ingestion for DIP-onboarded customers (commercial) |

The open `ComplianceHooks` stub in `packages/enterprise-proxy` encodes the
deadlines so commercial reporters can slot in without API changes.

## 6. Why this model fits this market

- UPI infrastructure is adopted, not impulse-bought: banks and PSPs integrate
  what the ecosystem already trusts. Open-core maximises how many teams can
  try it before procurement is involved.
- Utility pricing matches payment-switch economics (paise-per-transaction is a
  familiar unit for lender finance teams).
- The on-prem tier exists because lenders with air-gapped infrastructure
  cannot adopt hosted services; what they pay for is determinism, audit and
  accountability.

## 7. Adoption and attribution

Attribution is mutual, opt-in and tiered — never automatic. Using the
software does not transfer brand or logo rights (trademark law plus
Apache-2.0 symmetry forbid it), and the open licence carries no
reporting obligation. Three lanes:

1. **Passive (built into Apache-2.0).** §4(d) requires NOTICE-file
   reproduction in derivative distributions — "uses Krediwall" carries
   into their artifacts with zero rights over their brand.
2. **Voluntary (open tier).** [ADOPTERS.md](../ADOPTERS.md): adopters
   self-register at a disclosure level they choose — name only, name +
   logo, or case study — revocable at any time. The
   [brand kit](brand-kit.md) licences the **"Secured by Krediwall"**
   badge to adopters running the engine in production, with an
   opt-in press-reference checkbox for mutual marketing.
3. **Contractual (paid tiers).** Managed Transit and On-Prem Vault
   agreements carry what open licences cannot: quarterly usage
   reporting, mutual logo/press rights with joint disclosure review
   and 30-day revocability, named-reference and case-study rights with
   pre-approval, and the **Krediwall Verified Deployment**
   certification (a paid deliverable they can cite in their own
   compliance marketing). An opt-in, anonymized benchmark feed from
   partners powers an annual public "State of Credit-on-UPI Fraud"
   report — market authority that also compounds the data moat.

What we deliberately do not do: telemetry or phone-home adoption
tracking. The engine logs nothing and makes no outbound calls
(see [SECURITY.md](../SECURITY.md)); for banks, that silence is part of
the product. Adoption visibility comes from the three lanes above.

---

## Sources

1. Sahamati, *RBI Recognition of Sahamati as SRO — new phase for India's AA ecosystem*, 5 Jun 2026 — https://sahamati.org.in/media-article/rbi-sro-recognition-account-aggregator-ecosystem/
2. Business Standard, *RBI recognises Sahamati Foundation as SRO for account aggregator ecosystem*, Jun 2026 — https://www.business-standard.com/finance/news/rbi-recognises-sahamati-foundation-as-sro-for-account-aggregator-ecosystem-126060501286_1.html
3. The Economic Times, *RBI approves Sahamati as SRO for AA ecosystem*, Jun 2026 — https://economictimes.indiatimes.com/tech/technology/rbi-approves-sahamati-as-sro-for-account-aggregator-ecosystem/articleshow/131535777.cms
