# Problem Statement: Fraud on Credit-on-UPI

> Why a credit line riding a 200-millisecond rail needs a new kind of firewall.

## 0. First principles: the velocity–liquidity safety valve

Traditional banking fraud defence rests on an implicit safety valve — the
**velocity–liquidity trade-off**. Until now, Indian payment systems occupied
one of two safe quadrants:

```
Lending / credit cards  ──► [ high capital exposure ] ──► [ hours/days to underwrite ]
Retail P2P/P2M UPI      ──► [ low capital risk (own $) ] ──► [ <200ms rails ]

Credit-on-UPI           ──► [ HIGH CAPITAL EXPOSURE ]   ┼──► [ <200 MILLISECOND RAILS ]
```

- Credit products always carried high capital exposure, but granted liquidity
  over hours or days — leaving a wide window for batch underwriting, manual
  review and pre-release compliance blocks.
- UPI always executed instantly, but could only move money the customer
  already had — the blast radius was bounded by an account balance.

Credit Line on UPI collapses both safety valves at once: a compromised credit
account lets a fraudster draw down the **lender's pre-sanctioned balance sheet
in real time**, inside the same ~200 ms window that made UPI the world's
highest-volume rail. Anything that wants to stop it must decide **before
settlement** — which is why the evaluation budget collapses to single-digit
milliseconds.

## 1. What changed

In September 2023 the RBI opened UPI to **pre-sanctioned credit lines** as a funding account — previously UPI could only debit savings accounts, overdraft accounts, prepaid wallets and (from 2022) RuPay credit cards. [1] The product was launched at Global Fintech Fest 2023 alongside UPI Lite X and conversational payments. [2]

This changed the blast radius of a UPI fraud:

| | Deposit-account UPI fraud | Credit-on-UPI fraud |
|---|---|---|
| Whose money is taken | The victim's own balance | **The lender's loaned capital** |
| Recovery path | Reversal, chargeback, complaint | The "borrower" is a mule — there is no one to collect from |
| Effective exposure | Account balance | The full sanctioned limit |
| Time-to-drain | Limited by balance & daily caps | A fresh ₹60,000–₹1,00,000 line can be emptied in under a minute |

UPI fraud overall is already at industrial scale: the Ministry of Finance reported **16.29 lakh UPI fraud incidents involving ₹1,226.37 crore in FY 2025–26** (partial year), up from 4.07 lakh / ₹242 crore in FY 2021–22 — a 5× rise in value terms in four years. [3] Fraud incidents grew 85% in FY24 alone even as volumes grew 57%. [4]

## 2. The latency constraint

A UPI authorization must settle inside the switch window — conventionally budgeted at **~200 ms** end-to-end across PSP, issuer and NPCI hops. Whatever fraud check sits in that window has a fraction of it:

```
payer app → PSP switch → [ VAYU: <5ms verdict ] → NPCI → issuer → payee
                              ↑  the only place
                                 fraud can still
                                 be killed in-flight
```

- **Card-network engines are too slow and too heavy.** They assume scheme-level telemetry (3-DS, network tokens, EMV data) and decision budgets of hundreds of milliseconds on dedicated infrastructure.
- **UPI fraud engines don't model credit.** They watch account-level anomalies, not *limit-utilization mechanics*: a ₹49,999 debit looks unremarkable until you know the line was sanctioned 40 minutes ago and this is the second identical ticket to an unverified terminal.
- **Post-hoc detection is already too late.** Once the rail settles, funds hop multi-layer mule networks within minutes — CBI found mule accounts are "used only once in most cases: once the money comes in, it is distributed to other accounts and the mother account is closed." [5]

## 3. The attack vectors Vayu targets

### 3.1 Velocity spike / mule fanout
A freshly approved credit line fires spend at many distinct merchant VPAs — or across geographically inconsistent cells — inside tens of seconds. Individually legitimate-looking txns; collectively a drain pattern.
→ `telemetry.velocity-spike`: distinct payee-VPA and geo-cell counts per credit line inside a 60 s sliding window.

### 3.2 Rapid multi-mule drain
Repeat **just-under-threshold tickets** (₹45,000–₹50,000 — sized to duck reporting/KYC boundaries) to *unverified terminals*, burning ≥90% of the sanctioned limit inside the window. Signature of laundering through POS networks rather than real consumption.
→ `telemetry.mule-drain`: cumulative window burn vs. sanctioned limit, band-ticket repetition, freshness of the credit line (`creditLineApprovedAtMs`).

### 3.3 Counterparty reputation
Payee VPAs already surfaced on national fraud infrastructure — citizen reports on **Chakshu** (Sanchar Saathi, launched March 2024) [6] and DoT's **Financial Fraud Risk Indicator** (launched May 2025; RBI directed all banks to integrate it for real-time decisions in June 2025). [7]
→ `dpi.feed-reputation`: BLOCK on listed VPA, REVIEW on elevated risk score.

### 3.4 Multi-hop mule rings *(commercial seam)*
Single-VPA lookups miss networks. `evaluateGraphNetwork()` is the reserved hook for scoring recipients against mule-ring graphs — the layer where stolen credit converges. I4C's suspect registry has already shared **24.67 lakh Layer-1 mule accounts** with participating banks, enabling ₹8,031 crore of declined transactions. [8]

## 4. Why existing stacks miss this

1. **Wrong asset model.** Savings-fraud systems ask "is this the real account holder?" Credit-on-UPI must also ask "is this line being *consumed* like a loan — or *laundered* like a mule?" Utilization velocity, band-ticket sizing and line age are new signals.
2. **Wrong latency budget.** Anything that can't return a verdict in low single-digit milliseconds gets bypassed or sampled — and sampled fraud on a rail moving ₹97,913 crore *per day* [9] is a rounding-error defence.
3. **Wrong data posture.** Shipping raw VPA/device telemetry to a cloud scorer breaks RBI data-sovereignty expectations and adds network latency. Vayu evaluates **in-memory, in-process**, keeping only non-reversible hashes.
4. **Mule economics.** With ~4,000 mule accounts reported per day [10] and over 2 million mule identifiers shared with banks [11], the counterparty side of a transaction is now the dominant signal — and it must be checked synchronously, not reconciled overnight.

## 5. The regulatory frame the engine must fit

Credit-on-UPI fraud checks don't operate in a vacuum — they sit inside RBI's
fraud-risk and incident-reporting machinery:

- **Pre-sanctioned credit lines on UPI** — the enabling circular leaves terms
  (limits, interest, credit period) to each bank's board-approved policy,
  which pushes fraud-control design onto the lender's own systems. [1]
- **Master Directions on Fraud Risk Management (July 2024)** — all regulated
  entities (now extended to NBFC-UL/ML, UCBs, RRBs, HFCs) must run a
  board-approved framework of **Early Warning Signals (EWS)** and **Red
  Flagged Accounts (RFA)**, with EWS *integrated into the Core Banking
  Solution or operational systems* — i.e., synchronous evaluation, not
  after-the-fact review — and frauds reported to RBI via the FMR portal
  within **14 days of classification**. [12]
- **Limited customer liability (July 2017 circular)** — a customer who
  reports an unauthorized transaction within **3 days** bears zero liability
  where the failure is in the bank's own systems; banks must run 24×7
  reporting channels. In practice this pushes the cost of undetected
  infrastructure-level fraud onto the institution. [13]
- **CERT-In 6-hour incident reporting** — since April 2022, cyber incidents
  must be reported to CERT-In within 6 hours of notice — the window the
  paid-tier automated reporters are built against. [14]

## 6. Design answer (how the code maps to the problem)

| Constraint | Implementation |
|---|---|
| <5 ms verdict | Synchronous rule chain, first-`BLOCK` short-circuit, zero allocation on clean path |
| High concurrency, no GC pauses | Fixed-capacity typed-array `RingBuffer` per credit line; reused scratch buffers |
| RBI data sovereignty | In-memory only; FNV-1a/salted-SHA-256 hashes instead of retained VPAs |
| Fresh-line emphasis | `creditLineApprovedAtMs` drives BLOCK vs REVIEW severity in the drain rule |
| National feed compliance | `FraudFeed` interface models Chakshu/FRI snapshot exchange via DIP |
| Processor integration | `VayuAdapter` + `createHttpAdapter` (`POST /v1/evaluate`) drop into the switch pipeline |

---

## Sources

1. RBI, *Operation of Pre-Sanctioned Credit Lines at Banks through Unified Payments Interface (UPI)*, RBI/2023-24/58, 4 Sep 2023 (updated 12 Feb 2025) — https://www.rbi.org.in/Scripts/RTGS_Notification.aspx?Id=12532
2. The Hindu BusinessLine, *RBI, NPCI introduce credit lines on UPI, conversational payments*, 6 Sep 2023 — https://www.thehindubusinessline.com/money-and-banking/rbi-npci-introduce-credit-lines-on-upi-conversational-payments/article67278166.ece
3. Ministry of Finance, Rajya Sabha Unstarred Q.3610 (*UPI fraud cases*), answered 24 Mar 2026 — https://www.medianama.com/wp-content/uploads/2026/04/AU3610_lsAdtZ.pdf
4. CNBC-TV18, *UPI fraud cases surge by 85% in FY24*, Parliament reply analysis — https://www.cnbctv18.com/business/finance/upi-fraud-cases-rise-85-pc-in-fy24-increase-parliament-reply-data-19514295.htm
5. The Economic Times / CBI, *Over 8.5 lakh mule accounts in 700 bank branches used by cyber criminals*, 2025 — https://economictimes.indiatimes.com/news/india/over-8-5-lakh-mule-accounts-in-700-bank-branches-used-by-cyber-criminals-cbi/articleshow/122094137.cms
6. Press Information Bureau, *'Chakshu' facility on Sanchar Saathi portal*, 4 Mar 2024 — https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2011383
7. Press Information Bureau, *RBI advises banks to integrate DoT's Financial Fraud Risk Indicator (FRI)*, Jun–Jul 2025 — https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2141616
8. Ministry of Home Affairs via PTI/ThePrint, *I4C suspect registry blocked ₹8,031 cr of cyber fraud funds*, Dec 2025 — https://theprint.in/india/special-i4c-registry-led-to-blocking-of-rs-8031-cr-cyber-fraud-funds-govt/2802007/
9. NPCI product statistics via Business Standard, *UPI volumes at 24.07 bn in September 2026* — https://www.business-standard.com/finance/news/upi-transactions-september-2026-mdr-october-15-npci-126100100510_1.html
10. I4C / NCERT webinar deck, *Trends in Cybercrimes & Banking abuse*, Aug 2024 — https://ciet.ncert.gov.in/storage/app/public/files/17/webinar01/August2024/08032024.pdf
11. Hindustan Times, *I4C shared details of 2 million+ mule accounts with banks: MHA* — https://www.hindustantimes.com/india-news/14c-shared-details-of-2-million-mule-accounts-8-lakh-suspects-with-banks-mha-101743000148884.html
12. RBI, *Master Directions on Fraud Risk Management* (EWS/RFA framework, FMR reporting), Jul 2024 — https://rbi.org.in/Scripts/NotificationUser.aspx?Id=12702 and (NBFC-UL/ML) https://rbi.org.in/SCRIPTS/BS_ViewMasDirections.aspx?id=12704
13. RBI, *Customer Protection – Limiting Liability of Customers in Unauthorised Electronic Banking Transactions*, RBI/2017-18/15, 6 Jul 2017 — https://www.rbi.org.in/scripts/FS_Notification.aspx?Id=11040
14. CERT-In, *Directions under s.70B(6), IT Act 2000* — mandatory cyber-incident reporting within 6 hours, 28 Apr 2022 — https://www.cert-in.org.in/Directions70B.jsp
