# Glossary

Terms used across the Krediwall docs and code, in alphabetical order.

| Term | Meaning |
|---|---|
| **ALLOW / REVIEW / BLOCK** | Krediwall's three verdicts. BLOCK is the strongest; the engine stops at the first BLOCK. |
| **APP fraud** | Authorised Push Payment fraud: the victim is tricked into authorising the payment themselves. |
| **CERT-In** | Indian Computer Emergency Response Team. Its 28 Apr 2022 directions require cyber incidents to be reported within 6 hours of notice. |
| **Chakshu** | A DoT facility on the Sanchar Saathi portal for citizens to report suspected fraud *communications* (calls, SMS, WhatsApp). It is an input to FRI and is not a channel for reporting financial-fraud losses. |
| **CLOU** | Credit Line on UPI: a pre-sanctioned bank credit line linked to UPI as a funding account (RBI circular of 4 Sep 2023). |
| **Dedupe** | Engine option (`dedupeCapacity`) that returns the original `Evaluation` for a repeated `txnId`, so a switch retry cannot double-count rule state. |
| **DIP** | Digital Intelligence Platform: DoT's platform for sharing telecom-misuse and fraud intelligence with onboarded stakeholders such as banks, UPI service providers, telecom operators and law enforcement. |
| **DPI** | Digital Public Infrastructure — India's public digital rails. In this repo it does **not** mean deep packet inspection. |
| **Engine snapshot** | The JSON-safe state document from `exportState()`, restored with `restoreState()` so a restarted process or warm replica keeps per-line rule history. |
| **Evidence** | The optional structured record on a `RuleHit` (counts, ratios, hours) — the machine-readable counterpart of `reason`, intended for audit trails and fraud-filing defence. |
| **EWS / RFA** | Early Warning Signals and Red-Flagged Accounts: the framework RBI's fraud-risk directions require regulated entities to run, integrated with their operating systems. |
| **FMR** | The online portal through which regulated entities report frauds to RBI, within 14 days of classifying an incident as fraud. |
| **FRI** | Financial Fraud Risk Indicator: a DoT metric classifying a **mobile number** as Medium, High or Very High risk of financial fraud, delivered to stakeholders through DIP. |
| **I4C** | Indian Cyber Crime Coordination Centre (Ministry of Home Affairs). Runs the National Cybercrime Reporting Portal, the citizen fraud reporting system and the suspect registry. |
| **LRU** | Least recently used: the rule by which the oldest-untouched credit line is dropped when the tracked-line cap is reached. |
| **MCC** | Merchant Category Code. |
| **MNRL** | Mobile Number Revocation List: numbers DoT disconnected for cybercrime links, failed re-verification or misuse, shared with stakeholders. |
| **Mule account** | An account used to receive and move the proceeds of fraud, often opened with another person's KYC or by someone unaware of its abuse. |
| **NCRP** | National Cybercrime Reporting Portal (cybercrime.gov.in); helpline 1930. |
| **NPCI** | National Payments Corporation of India, which operates UPI and RuPay. |
| **Paise** | One hundredth of a rupee. All amounts in the code are integer paise. |
| **PSP** | Payment Service Provider: in UPI, the bank or entity that provides UPI services to apps and customers. |
| **Push-and-final** | UPI payments are initiated by the payer and, once completed, cannot be recalled by the system. |
| **Readiness / `readyz`** | A probe answering "is this instance usable now" (feed fresh, state restored) — distinct from `healthz`, which only answers "is the process alive". |
| **Replay** | Re-running a recorded transaction stream through the engine to measure catch rate and false positives — `tools/replay.mjs`, used to calibrate thresholds before production. |
| **RuPay credit card on UPI** | A RuPay credit card linked to a UPI app so it can pay merchants through UPI. |
| **SRO / SRO-AA** | Self-Regulatory Organisation. Sahamati Foundation was recognised by RBI in June 2026 as the SRO for the Account Aggregator ecosystem. |
| **Structuring** | Splitting a large amount into repeated tickets just under a scrutiny threshold to avoid controls; detected by the `structuring` rule. |
| **TPAP** | Third-Party Application Provider: a UPI app that is not itself a bank (NPCI's term). |
| **TSP** | Ambiguous. DoT sources use it for *Telecom* Service Provider; these docs avoid the term. |
| **UPI** | Unified Payments Interface, operated by NPCI. |
| **VPA** | Virtual Payment Address, e.g. `name@bank`. A VPA whose handle is a mobile number (`9876543210@ybl`) can be matched against mobile-keyed feeds such as FRI. |
