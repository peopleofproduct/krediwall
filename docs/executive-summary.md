# Executive Summary

**For:** risk, fraud and product leads at lenders and fintechs that fund UPI payments from credit.
**Status:** alpha, open source (Apache-2.0). Try it: `npm ci && npm run demo`.

## The risk

When credit funds a UPI payment, a fraud loss is the **lender's capital**, not the customer's balance — and UPI is push-and-final, so it cannot be recalled afterwards.

- Credit-funded UPI is growing: RuPay credit cards recorded **750 million UPI transactions worth ₹63,826 crore in April–October FY25**; Credit Line on UPI (CLOU) is earlier-stage but launching at more lenders. [1][2]
- UPI fraud reported to the government reached **₹1,226 crore in FY 2025–26 (partial year)**, up from ₹242 crore in FY 2021–22. [3]
- Mule networks launder the proceeds: I4C has shared **24.67 lakh Layer-1 mule accounts** with banks and financial institutions. [4]

## What Krediwall does

Krediwall runs **inside your own process**. For each credit-funded authorisation it returns `ALLOW`, `REVIEW` or `BLOCK` with the reasons, using signals only the lender holds: sanctioned limit, how much was burned in the last minute, how new the credit line is.

Starter rules (illustrative thresholds, to be calibrated on your data):

| Rule | Catches |
|---|---|
| Velocity spike | A credit line fanning out to many distinct payees or places inside a window |
| Mule drain | Repeat tickets inside an amount band to unverified terminals burning most of the limit |
| Feed reputation | A payee whose mobile number is flagged in a fraud-feed snapshot you supply (DoT's FRI) |
| Your own | Implement the `Rule` interface |

The design target is under 5 ms per verdict. On a Linux cloud VM benchmark (2M evaluations over 100k credit lines) the median was about 1 µs and p99 under 3 µs, with a worst case of a few milliseconds; a heavily loaded laptop showed rare outliers of tens of milliseconds. Run `npm run bench` on your own hardware.

## How it deploys

- As a **library** inside your Node.js/TypeScript switch or service, or as an **HTTP sidecar** (`POST /v1/evaluate`).
- Per-credit-line state lives in memory in fixed-size buffers (about 1.4 KB per tracked line); the number of tracked lines is capped.
- Nothing leaves your process and the library logs nothing. Fraud-feed snapshots are supplied by you.

## How it fits next to what you run

| | NPCI fraud monitoring | Enterprise fraud suites | In-house rules | **Krediwall** |
|---|---|---|---|---|
| Where it runs | NPCI service offered to banks [5] | Bank or vendor platforms, often integrated with core banking [6] | Your code | In your process |
| Strength | Network-wide visibility; provided to banks free of cost [5] | Broad: ML, cross-channel scoring, case management [6] | Full control | Credit-line context (limit burn, line age, fan-out); auditable rules; no network hop |
| Gap | Built on transaction and device profiling; does not carry the lender's credit-line state [5] | Typically heavier to implement (one published rollout took six months) [6]; we found no public credit-line-on-UPI-specific module | You build and maintain everything | No ML, no case management, no consortium data; alpha |

Krediwall is designed to run **beside** these, not replace them.

## What it cannot do today

- No machine learning, device or behavioural signals, or shared mule graph.
- No analyst workflow, alert queue or case management.
- Thresholds are illustrative: there is no public labelled dataset, so you must calibrate on your own traffic.
- It calls no government API. DoT's FRI is keyed by **mobile number** and is delivered to onboarded stakeholders through the Digital Intelligence Platform; Krediwall consumes a snapshot you obtain, and applies it only to payees whose VPA is a phone number.

## Regulatory touchpoints

RBI's fraud-risk directions expect Early Warning Signals integrated with operating systems, fraud reporting through the FMR portal within 14 days of classification, and CERT-In requires cyber-incident reporting within 6 hours. [7] Krediwall's rule hits can feed an EWS and the repository encodes these deadlines as helpers; automated reporting is a separate commercial module. **Krediwall is not a compliance certification.**

## Next steps

Run the demo, read the [problem statement](problem-statement.md), and open an issue on GitHub if you want to discuss a pilot or share a labelled dataset.

---

**Sources:** [1] Mint, *RuPay-on-UPI boosts card usage* — https://www.livemint.com/industry/banking/rupay-credit-cards-upi-monetization-banks-fintechs-credit-card-usage-11784887621642.html · [2] Business Standard, *Unclear guidelines hold back growth of credit line on UPI* — https://www.business-standard.com/finance/news/unclear-guidelines-hold-back-growth-of-credit-line-on-upi-since-launch-125100500501_1.html · [3] Ministry of Finance, Rajya Sabha Q.3610, 24 Mar 2026 — https://www.medianama.com/wp-content/uploads/2026/04/AU3610_lsAdtZ.pdf · [4] PTI/ThePrint, *I4C registry blocked ₹8,031 cr* — https://theprint.in/india/special-i4c-registry-led-to-blocking-of-rs-8031-cr-cyber-fraud-funds-govt/2802007/ · [5] Rajya Sabha Q.3610 (NPCI fraud-monitoring solution) and The Times of India, *NPCI developing 'federated model'* — https://timesofindia.indiatimes.com/business/india-business/npci-developing-federated-model-to-counter-fraud-transactions-using-upi/articleshow/119913366.cms · [6] See [problem statement](problem-statement.md), source 18 · [7] See [problem statement](problem-statement.md) §5, sources 12 and 14.
