# Market Opportunity & Timing: Why Krediwall, Why Now

> The rail is built, the credit is arriving, the fraud is already here — and the regulator has directed banks to consume fraud signals of the kind Krediwall uses.

## 1. The rail: UPI at national scale

UPI is one of the world's largest real-time payment systems:

- **24.07 billion transactions worth ₹29.37 lakh crore in September 2026** — +23% YoY by volume, +18% by value; a record 24.51 bn in August 2026. [1]
- **802 million transactions and ₹97,913 crore moved *per day*.** [1]
- FY24 closed at 13,113 crore transactions for the year (+57% YoY). [2]

Reported UPI fraud (~₹1,226 crore in FY 2025–26, partial year) works out to roughly a third of a basis point of rail value — a small ratio that still totals over a thousand crore a year.

## 2. The credit layer is switching on

Credit Line on UPI (CLOU) spent two years in a regulatory grey zone — banks hesitated over whether to treat it as a credit card or a personal loan, and monthly value was estimated at around ₹500 crore (an estimate for last year that may have since declined). [3] That ambiguity is resolving and the rollout has begun:

- **First movers are live.** Suryoday Small Finance Bank (with Paytm, launched Aug 2025) reported a **~63% compounded monthly growth rate over five months**, reaching ~11 lakh pre-qualified customers, 5.3 lakh sanctions and ₹362 crore of sanctioned limits within eight months — from a very small base. 97% of its CLOU customers were new to the bank. [4]
- **Large lenders are reportedly entering.** Axis Bank and HDFC Bank are reported to be preparing CLOU launches with fintech partners (Navi, Super.Money, SalarySe); Kotak Mahindra already offers a secured card via Super.Money. Industry estimates put issued credit lines at ~3–4 lakh. [5]
- **The product skews to small, everyday use.** Suryoday reports average *utilisation* of around ₹7,000 against limits of up to ₹60,000 (its sources describe this variously as "average utilisation" and "utilised ticket size") and a customer base that is mostly prime. [4] Thin-file and first-time borrowers are where mule recruitment and synthetic-identity abuse tend to concentrate, which is why early fraud controls matter.
- NPCI frames CLOU as early build-out: "very, very small… many banks are yet to enable it fully." [6]

### RuPay credit cards on UPI are already much larger

The bigger credit-funded flow today is RuPay credit cards linked to UPI: **750 million transactions worth ₹63,825.8 crore in April–October FY 2024–25** (finance-ministry data cited by Mint) — roughly 107 million transactions and ₹9,100 crore a month on average, and an average ticket of about ₹850. Bernstein estimates that card-linked UPI is nearly four in ten credit-card transactions but about 8% of spend. [16] Overall credit-card transactions grew 24.1% year-on-year to 601 million in July 2026 while the average ticket fell 13.5% to ₹3,460, a shift attributed in part to RuPay-on-UPI. [17]

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

The trajectory matters more than the stock: UPI fraud *value* grew ~5× in four fiscal years while the rail stays real-time and irrevocable — the property that makes UPI successful is the property that makes after-the-fact defence weak.

## 4. The regulatory tailwind is unusually direct

Most fraud products must *convince* institutions to consume threat intelligence. Here the regulator has already directed it:

- **June 30, 2025 — RBI advisory directing all Scheduled Commercial Banks, SFBs, Payments Banks and Co-operative Banks to integrate DoT's Financial Fraud Risk Indicator (FRI)** into their systems via API, for real-time declines, alerts or delays. [12] FRI classifies **mobile numbers** as Medium/High/Very High fraud risk from inputs including I4C, Chakshu and bank reports. Early results: 34 institutions froze 10.02 lakh accounts and restricted 3.05 lakh more. [13]
- **Chakshu** (March 2024) put citizen-reported fraudulent communication onto a national platform; the Digital Intelligence Platform it connects to now has ~1,200 organisations onboarded. [14]
- **I4C's suspect registry** (Sept 2024) institutionalised mule-account sharing between banks. [9]
- **April 2026 — RBI discussion paper** *"Exploring safeguards in digital payments to curb frauds"* frames the problem as Authorised Push Payment fraud and signals forthcoming protection and compensation obligations; a February 2026 High Court notice has already asked pointed questions about UPI fraud safeguards. [15]

Read plainly: lenders that fund UPI payments from credit will be expected to run real-time fraud checks enriched by national signals — and smaller banks "lack understanding of the product" and the technology to build it in-house. [3] That is a gap an embeddable engine can fill.

## 5. Why now — the window

1. **Before the curve.** CLOU is at roughly ₹500 crore a month and RuPay-on-UPI near ₹9,000 crore a month inside a ₹29 lakh crore a month rail. Defences chosen now are more likely to become defaults than defences bought in a hurry after volumes arrive.
2. **Loss lands on the lender.** Credit-funded fraud is paid for from the lender's capital, and RBI's fraud-risk directions already expect early-warning systems integrated with operating systems. [12] We expect credit-drain incidents to become more likely as volumes grow — this is our judgement, not a sourced forecast.
3. **An open gap.** We have not found an open-source, credit-line-aware fraud engine for this slot (as of October 2026); corrections welcome. An Apache-2.0 engine any PSP, bank or fintech can embed, with commercial graph and compliance layers on top, matches how this infrastructure is bought.
4. **Complementary to NPCI, not a competitor.** NPCI already gives banks a fraud-monitoring score free of cost [18], built on transaction and device profiling. The gap Krediwall targets is lender-side credit context — limit, burn, line age — that those models do not carry. Krediwall is designed to sit beside NPCI's score, not replace it.

## 6. What a lender-side firewall actually sees

A firewall like Krediwall evaluates **credit-funded UPI transactions, not all UPI**:

- RuPay credit cards on UPI: ~107 million transactions a month on average in April–October FY25, average ticket ~₹850, and growing. [16]
- CLOU: ~₹500 crore a month in value (estimated), from a small number of live lenders. [3][4]
- Everything else on the rail — savings-account UPI, wallets — is outside the scope of lender-side credit context.

So the addressable *evaluation volume* is a small slice of UPI today by count and value, but a fast-growing one, concentrated in a short list of lenders and the fintech apps that front them. Sizing that slice should start from those transaction counts, not from a percentage of all UPI traffic.

---

## Sources

1. Business Standard / NPCI product statistics, *UPI volumes at 24.07 bn in September 2026* — https://www.business-standard.com/finance/news/upi-transactions-september-2026-mdr-october-15-npci-126100100510_1.html ; Entrackr — https://entrackr.com/news/upi-transaction-volume-stays-above-24-bn-despite-18-m-o-m-dip-in-september-12611636
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
16. Mint, *RuPay-on-UPI boosts card usage, but profits remain elusive* — https://www.livemint.com/industry/banking/rupay-credit-cards-upi-monetization-banks-fintechs-credit-card-usage-11784887621642.html
17. Moneycontrol, *Credit card transactions jump 24%, but average spend falls 13%. Is UPI changing how we use cards?* (July 2026) — https://www.moneycontrol.com/news/business/personal-finance/credit-card-transactions-jump-24-but-average-spend-falls-13-is-upi-changing-how-we-use-cards-14019674.html
18. The Times of India, *NPCI developing 'federated model' to counter fraud transactions using UPI*, 2025 (NPCI risk codes provided free of cost to banks) — https://timesofindia.indiatimes.com/business/india-business/npci-developing-federated-model-to-counter-fraud-transactions-using-upi/articleshow/119913366.cms
