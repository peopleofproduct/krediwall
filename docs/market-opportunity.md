# Market Opportunity & Timing: Why Vayu, Why Now

> The rail is built, the credit is arriving, the fraud is already here — and the regulator just directed banks to consume the exact signals Vayu uses.

## 1. The rail: UPI at sovereign scale

UPI is the largest real-time payment rail on earth by volume:

- **24.07 billion transactions worth ₹29.37 lakh crore in September 2026** — +23% YoY by volume, +18% by value; a record 24.51 bn in August 2026. [1]
- **802 million transactions and ₹97,913 crore moved *per day*.** [1]
- FY24 closed at 13,113 crore transactions for the year (+57% YoY). [2]

Reported fraud (~₹1,226 crore in FY 2025–26) works out to roughly a third of a basis point of rail value — and still totals over a thousand crore a year. There is no comparable payment system where a single integration point touches this much daily value.

## 2. The credit layer just switched on

Credit Line on UPI (CLOU) spent two years as a regulatory grey zone — banks hesitated over whether to treat it as a credit card or a personal loan, and monthly value stayed around ~₹500 crore. [3] That ambiguity is resolving, and the rollout phase has visibly begun:

- **First movers are live and compounding.** Suryoday Small Finance Bank (with Paytm, launched Aug 2025) hit a **63% compounded monthly growth rate**, reaching ~11 lakh pre-qualified customers, 5.3 lakh sanctions and ₹362 crore of sanctioned limits in eight months. 97% of CLOU customers were *new to the bank*. [4]
- **The big lenders are reportedly entering.** Axis Bank and HDFC Bank are preparing CLOU launches with fintech partners (Navi, Super.Money, SalarySe); Kotak Mahindra already ships a secured card via Super.Money. Industry estimates put issued credit lines at ~3–4 lakh and "growing at a rapid clip." [5]
- **The product is structurally fraud-friendly early on.** Suryoday's data shows small tickets (avg ~₹7,000, limits to ₹60,000) aimed at first-time and thin-file borrowers — precisely the segment where mule recruitment and synthetic-identity abuse concentrate. [4]
- NPCI itself frames CLOU as early build-out: "very, very small… many banks are yet to enable it fully" — i.e., the fraud infrastructure should land *before* the volumes do, not after. [6]

## 3. The fraud bill is already due

| Metric | Value | Source |
|---|---|---|
| UPI fraud FY 2025–26 (partial) | **16.29 lakh incidents / ₹1,226 crore** | MoS Finance, RS Q.3610 [7] |
| FY 2023–24 | 13.42 lakh / ₹1,087 crore (+85% YoY) | [7], [8] |
| FY 2021–22 | 4.07 lakh / ₹242 crore | [7] |
| Layer-1 mule accounts shared with banks | **24.67 lakh** | I4C suspect registry [9] |
| Fraud txns declined via registry | **₹8,031 crore** | [9] |
| Mule accounts detected by CBI | 8.5 lakh across 700 branches | [10] |
| Daily cyber-fraud cadence | ~7,000 complaints & ~₹50 crore reported loss *per day* | I4C [11] |

The trajectory matters more than the stock: UPI fraud *value* grew ~5× in four fiscal years while regulators are simultaneously pushing the ecosystem toward **instant, irrevocable settlement** — the property that makes UPI successful is the property that makes post-hoc fraud defence useless.

## 4. The regulatory tailwind is unusually direct

Most fraud products have to *convince* institutions to consume threat intel. Here the regulator has already ordered it:

- **June 30, 2025 — RBI advisory directing all Scheduled Commercial Banks, SFBs, Payments Banks and Co-operative Banks to integrate DoT's Financial Fraud Risk Indicator (FRI)** into their systems via API, for real-time declines/alerts/delays. [12] FRI classifies mobile numbers Medium/High/Very High fraud risk from I4C, Chakshu and bank inputs. Early results: 34 institutions froze 10.02 lakh accounts and restricted 3.05 lakh more. [13]
- **Chakshu** (March 2024) put citizen-reported fraud communication onto a national platform (Sanchar Saathi / Digital Intelligence Platform, ~1,200 organisations onboarded). [14]
- **I4C's suspect registry** (Sept 2024) institutionalised mule-account sharing between banks. [9]
- **April 2026 — RBI discussion paper** *"Exploring safeguards in digital payments to curb frauds"* frames the problem explicitly as Authorized Push Payment fraud and signals incoming protection/compensation obligations; a February 2026 High Court notice has already asked pointed questions about UPI fraud safeguards. [15]

Read plainly: banks that ship credit lines on UPI will be *expected* to run synchronous, real-time fraud checks enriched by national feeds — and most smaller banks "lack understanding of the product" and the technology to build it in-house. [3] That gap is exactly where an open, embeddable engine wins.

## 5. Why now — the window

1. **Pre-curve deployment.** CLOU is at ~₹500 crore/month inside a ₹29 lakh crore/month rail. Defence built now becomes the default before volumes force rushed procurement.
2. **First credible fraud season.** India's cyber-fraud economy runs on mule velocity; the first large credit-drain incidents on UPI credit lines are a when, not an if — and the lenders whose capital is drained will be accountable to RBI scrutiny, not just card-scheme chargeback tables.
3. **Open-core timing.** No credible open-source option exists between "generic UPI rules" and "enterprise card-scheme engines." An Apache-2.0 engine that any TSP/bank/fintech can embed in its switch — with commercial graph-network and billing layers on top — matches how this market actually buys infrastructure.
4. **Ecosystem precedent.** NPCI's own fraud solution, bank-side systems and the FRI mandate all point the same direction: the stack that runs *inside* the authorization window wins. Vayu's <5 ms in-memory design is built for exactly that slot.

## 6. What success looks like (order of magnitude)

A firewall layer priced as infrastructure — a few paise per evaluated authorization — on even 1% of daily UPI volume is ~8 million verdicts/day. At CLOU's Suryoday-style trajectory (63% CMGR) replicated across just the announced bank entrants, the protected-credit surface grows from ~₹360 crore sanctioned to thousands of crores within a few product cycles — each rupee of it a lender's capital that a <5 ms verdict can still save.

---

## Sources

1. Business Standard / NPCI product statistics, *UPI volumes at 24.07 bn in September 2026* — https://www.business-standard.com/finance/news/upi-transactions-september-2026-mdr-october-15-npci-126100100510_1.html ; enttrackr — https://entrackr.com/news/upi-transaction-volume-stays-above-24-bn-despite-18-m-o-m-dip-in-september-12611636
2. CNBC-TV18, *UPI fraud cases surge 85% in FY24* — https://www.cnbctv18.com/business/finance/upi-fraud-cases-rise-85-pc-in-fy24-increase-parliament-reply-data-19514295.htm
3. Business Standard, *Unclear guidelines hold back growth of credit line on UPI since launch*, Oct 2025 — https://www.business-standard.com/finance/news/unclear-guidelines-hold-back-growth-of-credit-line-on-upi-since-launch-125100500501_1.html
4. ETBFSI, *Revolutionizing Retail Lending: Credit on UPI Gains Traction in India* (Suryoday SFB portfolio data) — https://bfsi.economictimes.indiatimes.com/articles/revolutionizing-retail-lending-credit-on-upi-gains-traction-in-india/131952343 ; BizzBuzz — https://www.bizzbuzz.news/Fintech/suryoday-sfb-finds-90-of-credit-on-upi-borrowers-are-prime-borrowers-1395362
5. The Economic Times, *Big banks like HDFC, Axis offer to process more credit lines on UPI* — https://m.economictimes.com/tech/technology/big-banks-like-hdfc-axis-offer-to-process-more-credit-lines-on-upi/amp_articleshow/125391313.cms
6. Financial Express, *Lenders go slow on credit line on UPI* (NPCI MD Dilip Asbe) — https://www.financialexpress.com/business/news/lenders-go-slow-on-credit-line-on-upi/4105944/
7. Ministry of Finance, Rajya Sabha Unstarred Q.3610, 24 Mar 2026 — https://www.medianama.com/wp-content/uploads/2026/04/AU3610_lsAdtZ.pdf
8. IANS, *UPI frauds worth Rs 805 crore this fiscal: Minister*, 15 Dec 2025 — https://ianslive.in/upi-frauds-worth-rs-805-crore-witnessed-this-fiscal-so-far-minister--20251215175703
9. PTI / ThePrint, *I4C registry led to blocking of ₹8,031 cr cyber fraud funds*, Dec 2025 — https://theprint.in/india/special-i4c-registry-led-to-blocking-of-rs-8031-cr-cyber-fraud-funds-govt/2802007/
10. The Economic Times / CBI, *8.5 lakh mule accounts in 700 bank branches* — https://economictimes.indiatimes.com/news/india/over-8-5-lakh-mule-accounts-in-700-bank-branches-used-by-cyber-criminals-cbi/articleshow/122094137.cms
11. I4C / NCERT webinar deck, *Trends in Cybercrimes & Banking abuse*, Aug 2024 — https://ciet.ncert.gov.in/storage/app/public/files/17/webinar01/August2024/08032024.pdf
12. Press Information Bureau, *RBI advises banks to integrate DoT's FRI* — https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2141616
13. Press Information Bureau, *DoT's FRI — outcomes and DIU outlay* — https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2153065
14. Press Information Bureau, *Chakshu launch on Sanchar Saathi*, 4 Mar 2024 — https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2011383 ; DIP onboarding — https://www.pib.gov.in/PressReleasePage.aspx?PRID=2223257
15. Ministry of Finance, Lok Sabha Unstarred Q.2432 (citing RBI's April 2026 discussion paper *Exploring safeguards in digital payments to curb frauds*), 3 Aug 2026 — https://sansad.in/getFile/lsapps/loksabhaquestions/annex/188/AU2432_dgiqQb.pdf ; RS Q.3610 (High Court notice, proposed compensation limit) — https://www.medianama.com/wp-content/uploads/2026/04/AU3610_lsAdtZ.pdf
