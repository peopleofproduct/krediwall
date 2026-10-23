# Visual assets — regeneration prompts

Prompts for the marketing-grade SVGs referenced from the README and docs.
Feed a prompt (with the shared preamble) to a capable design-capable model,
drop the resulting SVG into this directory, and link it where noted.
The technical diagrams (architecture, flows) are Mermaid inside the
markdown itself and stay in sync with the docs by review.

**Never add pricing figures to any public asset.** The tier structure is
public; prices are not (`docs/commercial-strategy.md`).

---

## Shared preamble — prepend to every prompt

> Context: Krediwall is an open-source fraud firewall for credit-funded
> UPI payments in India (github.com/peopleofproduct/krediwall). UPI
> payments are push-and-final — once completed they cannot be recalled —
> so when a payment funded by a bank's credit line is fraudulent, the
> loss is the lender's capital. Krediwall is a synchronous in-process
> check inside the bank's payment switch that scores each authorization
> ALLOW / REVIEW / BLOCK in single-digit microseconds using signals only
> the lender has (sanctioned credit limit, utilization burn, credit-line
> age) plus India's DoT fraud-intelligence feeds (FRI). It is
> Apache-2.0, published to npm as @krediwall/*, zero runtime
> dependencies, and runs entirely inside the lender's perimeter — it
> makes no outbound calls and stores identifiers only as keyed-HMAC
> digests. Audience: bank engineering leads and fraud/risk teams in
> India; credibility and honesty matter more than flair. Use only the
> exact figures given in the prompt — never invent numbers.
>
> Style: flat modern fintech infographic, white/very-light background
> (must sit on a GitHub README), sans-serif (Inter or similar), palette:
> deep navy #0A2540 for structure, teal #0EA5A4 for Krediwall elements,
> green #16A34A for protected outcomes, red #DC2626 used sparingly and
> only for fraud/loss paths, neutral grays for supporting text. Simple
> line icons, generous whitespace, numbered flows, small legend where
> colors carry meaning. No photorealism, no stock-photo humans, no 3D,
> no gradients heavier than subtle. Must stay fully legible at 800px
> width. Output: a single self-contained SVG, viewBox around 1600×900
> (1600×1000 for two-panel layouts), no external fonts, no scripts.

---

## before-after.svg — the before/after comparison

Reference it from the README, after "The problem in one paragraph".

> Create a two-panel before/after infographic, left panel "Without
> credit-aware screening" and right panel "With Krediwall", separated by
> a thin vertical rule with an arrow. LEFT (muted, red-tinted accents):
> a timeline of a mule attack on a fresh ₹1,00,000 credit line — T+0s
> "new credit line approved", T+40s "₹49,999 to unverified terminal",
> T+47s "₹49,999 again", T+90s "limit drained ~100%"; below it three
> short reason chips: "generic fraud stacks don't see limit burn",
> "UPI is push-and-final — no recall", "loss lands on the lender's
> capital". RIGHT (teal/green accents): same attack, but a Krediwall
> shield checkpoint between the attacker and the timeline — first large
> ticket gets REVIEW ("first-seen payee + 50% of limit"), second gets
> BLOCK with an evidence chip showing "burn ratio 1.0 · 2 repeat band
> tickets · unverified terminal"; the money arrow to the mule is cut
> with a clean "BLOCKED before money moved" marker. Bottom strip, small
> and factual, gray: "Reported UPI fraud: over ₹1,200 crore a year,
> ~5× in four years; police have flagged 24+ lakh mule accounts
> (sources in the market-opportunity doc)". Title: "Fraud on
> credit-funded UPI drains lender capital — or stops before the money
> moves."

## open-core.svg — the open-core split

Reference it from commercial-strategy.md and the README.

> Create a clean two-column architecture comparison graphic titled
> "Open core (this repo) — Commercial modules (private)". Left column,
> teal header "OPEN — Apache-2.0, on GitHub and npm": items listed as
> small chips — "evaluation engine + verdict state machine",
> "velocity / mule-drain / first-payee / structuring / dormant /
> odd-hours rules", "DoT FRI feed adapter", "HTTP gateway + Prometheus
> metrics + Grafana dashboards", "decision trail + replay calibration
> harness", "Docker / Kubernetes reference deploy". Right column, navy
> header "COMMERCIAL — private implementations": "mule-ring graph
> scoring", "automated CERT-In / FMR reporters", "managed DIP feed
> ingestion", "Krediwall Verified Deployment certification", "support,
> SLAs, audit guarantees". Between the columns draw three connector
> ports labeled "stable contract seams": "GraphEvaluator interface",
> "ComplianceHooks", "BillingMeter". Caption: "The seams are public and
> stable — the intelligence behind them is not."

## threat-patterns.svg — the six attack patterns

Reference it from the README and docs/problem-statement.md.

> Create a 2×3 grid of attack-pattern cards, each card: a small line
> icon, the pattern name, a one-line attack story, and the one-line
> signal that catches it (teal). Cards: (1) "Velocity spray" — "a fresh
> line pays 5+ strangers inside a minute" / "distinct payee count in a
> rolling window". (2) "Mule drain" — "repeat ₹49,999 tickets to an
> unverified terminal burn the limit" / "burn ratio + band repeats +
> terminal flag". (3) "First-payee large" — "a never-seen payee draws
> half the limit in one shot" / "first-seen payee × amount-to-limit
> ratio". (4) "Structuring" — "tickets clustered just under a scrutiny
> threshold" / "band-clustered repeats in a window". (5) "Dormant
> reactivation" — "a silent line suddenly spends" / "days idle before
> reactivation". (6) "Odd-hours activity" — "overnight spending on a
> line with no night history" / "IST hour band × per-line history".
> Title: "Six fraud patterns on credit-funded UPI — and the signal that
> sees each one". Each card footer, tiny gray: the rule name (e.g.
> `telemetry.mule-drain`).

## day-one.svg — the adoption timeline

Reference it from docs/getting-started.md.

> Create a horizontal 9-step timeline titled "From npm install to first
> verdict — one afternoon", numbered dots on a teal line, each with a
> short label and an even shorter time hint in gray: 1 "npm install
> @krediwall/* — zero dependencies" → 2 "npm run demo — see it think"
> → 3 "run the gateway — one command" → 4 "first API verdict + evidence
> JSON" → 5 "set KREDIWALL_API_KEY — lock the door" → 6 "plug in the FRI
> feed — translator included" → 7 "docker compose up — dashboard
> auto-loads" → 8 "replay labelled traffic — catch rate + FP rate" →
> 9 "decisions-report — the review trail". Under steps 7–9 a thin
> bracket: "what your fraud team sees on day one".
