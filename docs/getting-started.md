# Getting started — the full walkthrough, in plain words

This guide walks you from zero to a running fraud firewall in nine
steps. Each step has the command, what you should see, and what it
actually means. If you read nothing else, the one-line version is:

> Krediwall is a security guard that checks every credit-funded UPI
> payment *before* it goes through, in a few millionths of a second,
> and answers one of three words: **ALLOW** (fine), **REVIEW** (send to
> a human), **BLOCK** (stop it).

---

## Step 0 — What you need

- **Node.js 18 or newer** (`node --version`) — everything is plain
  JavaScript/TypeScript, no database, no external services.
- **Git** to clone this repo.
- **Docker** — only for Step 6 (the dashboard). Everything else runs
  without it.

Nothing else. No accounts, no API keys, no signups to see it work.

---

## Step 1 — Get the code

```bash
git clone https://github.com/peopleofproduct/krediwall.git
cd krediwall
npm ci
```

**What this does:** downloads the code and installs its dependencies.
The important ones (`core` and `telemetry-rules`) have *zero*
dependencies — that's deliberate: less supply-chain surface for a bank
to audit.

**What you should see:** an install with very few packages, then back
at the prompt.

---

## Step 2 — Watch it think (30 seconds)

```bash
npm run demo
```

**What this does:** runs four fake fraud scenarios through the engine
and prints each verdict as it happens — no server, nothing to configure.

**What you should see:**

```
2. Fresh credit line sprayed across many payees in seconds
  +   4s  BLOCK     ₹9,000  payee 5
            5 distinct payee VPAs in 60000ms (limit 4)

3. Repeat large tickets to unverified terminals drain ~100% of the limit
  +   7s  BLOCK    ₹49,999  unverified terminal
```

**What it means:** the first line is the classic mule attack — a newly
approved credit line paying five different strangers within a minute.
The second is the drain — ₹49,999 tickets (just under ₹50,000, hoping to
dodge scrutiny) to a terminal nobody verified, burning the whole limit.
Both got **BLOCK** with the reason printed. If you only take one thing
from this guide: the reason is always shown, because a blocked customer
will ask why.

---

## Step 3 — Run it as a real service

```bash
npm run gateway
```

**What this does:** starts an HTTP service (the "reference gateway") on
port 8080 — the same one you'd put behind your payment switch.

**What you should see:**

```
rules: telemetry.velocity-spike, telemetry.mule-drain, ...
listening on :8080  — POST /v1/evaluate · GET /healthz · GET /readyz · GET /metrics
```

Now send it a payment decision, the way your switch would:

```bash
curl -s http://localhost:8080/v1/evaluate \
  -H 'content-type: application/json' \
  -d '{ "txnId":"t-1", "creditLineId":"line-42", "payerVpa":"user@okbank",
        "payeeVpa":"pos1@ybl", "amountPaise":4999900, "creditLimitPaise":10000000,
        "timestampMs":1760000000000, "terminalVerified":false }'
```

**What you should see:**

```jsonc
{ "verdict": "BLOCK", "degraded": false, "elapsedMicros": 23.4,
  "hits": [ { "rule": "telemetry.mule-drain", "verdict": "BLOCK",
              "reason": "100.0% of limit burned via 2 repeat band tickets to unverified terminal",
              "evidence": { "burnRatio": 1, "repeats": 2, "unverifiedTerminal": 1 } } ],
  "ruleErrors": [] }
```

**How to read the answer, field by field:**

| Field | Plain meaning |
|---|---|
| `verdict` | The decision: ALLOW, REVIEW or BLOCK. |
| `hits` | Which rules fired and why. Empty = nothing looked wrong. |
| `reason` | The sentence you'd put in front of a human. |
| `evidence` | The same justification as numbers — what you'd attach to a fraud report. |
| `degraded` | "Was I at my best when I decided this?" `false` = yes, every rule ran cleanly. If `true`, something threw or the input was odd — don't trust the verdict at face value. |
| `ruleErrors` | Rules that crashed and were skipped. Empty is the healthy state. |
| `elapsedMicros` | How long the check took — 23.4 *millionths* of a second. Your budget is 5,000. |
| `x-request-id` (header) | Send your own and it comes back — so the verdict can be tied to your switch's logs. |

---

## Step 4 — Lock the door (API key)

```bash
KREDIWALL_API_KEY=my-secret node examples/reference-gateway.mjs
```

Now the same curl gets rejected until you add the key:

```bash
curl -s http://localhost:8080/v1/evaluate \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer my-secret' \
  -d '{ ... same transaction ... }'
```

**What this means:** without a key, anyone who can reach the port can
ask for verdicts and read your metrics. The key is compared in constant
time (no timing leaks). `/healthz` and `/readyz` stay open on purpose —
your load balancer needs them. In a bank, you'll also wrap the service
in mTLS or a service mesh — that part is your infrastructure, not this
repo.

---

## Step 5 — Plug in a fraud feed

The government's FRI data (flagged mobile numbers) reaches you — the
lender — through the DIP platform, in whatever format your agreement
gives you. Turn that export into the file Krediwall reads:

```bash
node examples/translate-dip-export.mjs \
  --input=your-dip-export.csv --output=fri-latest.json
```

Then serve with it:

```bash
KREDIWALL_FRI_SNAPSHOT=fri-latest.json \
KREDIWALL_FRI_HMAC_KEY=your-hmac-key \
KREDIWALL_API_KEY=my-secret \
node examples/reference-gateway.mjs
```

**What this means:** payees whose mobile number is on the flagged list
now get REVIEW or BLOCK automatically. Numbers are stored as keyed
HMAC digests — a fingerprint, not the number itself. If the file gets
old (stale), `/readyz` starts answering 503 so your load balancer knows
coverage is degraded, instead of silently trusting a dead list.

Merchant VPAs that aren't phone numbers (`shop42@paytm`) can't be
checked against a mobile-keyed feed by themselves — give the gateway
your merchant registry (`KREDIWALL_VPA_REGISTRY`) to resolve them.

---

## Step 6 — See the dashboard

```bash
docker compose -f deploy/docker-compose.yml up --build
```

**What this does:** brings up three services — the gateway, Prometheus
(collector) and Grafana (the screens) — with the Krediwall dashboard
and alert pack pre-loaded. Nothing to configure in the UI.

**Where to look:**

| URL | What |
|---|---|
| http://localhost:3000 | Grafana — the dashboard loads itself; anonymous view is on for the demo |
| http://localhost:8080 | The gateway (Bearer `demo-krediwall-token`) |
| http://localhost:9090 | Prometheus raw |

**The panels in plain words:** *Evaluations/s* is your traffic;
*BLOCK share* is how much you're stopping (if it jumps, your thresholds
are probably too tight, not that fraud spiked); *rule errors* and
*dropped audit records* should be zero forever — non-zero means the
engine was partially blind; *evicted lines* means the notebook filled up
and needs a bigger cap; *latency* shows p50/p99 against the 5ms budget.

**The alerts in plain words:** you get paged when a rule is throwing,
when audit records were dropped (compliance risk), when latency breaches
the budget, when state evictions climb, or when the BLOCK rate stays
high — each alert says what to do next in its description.

---

## Step 7 — Prove it works on *your* traffic

This is the step banks actually care about. Take a labelled slice of
your transaction history (one transaction per line, with the verdict you
*expected*), and replay it:

```bash
node tools/replay.mjs --input=your-history.jsonl
```

**What you should see:**

```
confusion (rows = expected, cols = produced)
              ALLOW REVIEW  BLOCK
  ALLOW           9      0      0
  BLOCK           0      0      2
  REVIEW          0      4      0

catch rate      100.0%  (flagged expectations met)
false positives   0.00%  (ALLOW-labelled txns blocked)
```

**How to read it:** the diagonal is the happy case — expected and
produced match. *Catch rate* is "of the bad ones, how many did we at
least flag?" *False positives* is "of the good ones, how many did we
wrongly block?" — the number your business team will ask about, because
every false block is a customer saying "why was my payment rejected?"

**Then calibrate:** edit thresholds in a rules JSON
(`KREDIWALL_RULES_CONFIG`, schema in the integration guide), replay
again, compare. That loop — traffic, labels, thresholds, repeat — is
how the starter defaults become *your* tuned numbers. Never trust a
BLOCK rate you haven't replayed.

---

## Step 8 — The paper trail for reviewers

```bash
KREDIWALL_DECISION_LOG=/var/lib/krediwall/decisions.jsonl \
KREDIWALL_API_KEY=my-secret \
node examples/reference-gateway.mjs
```

Every evaluation is appended (without slowing the hot path) as one JSON
line — verdict, reasons, evidence, latency. Then summarise it for your
review team:

```bash
node tools/decisions-report.mjs --input=decisions.jsonl
```

You get the verdict mix, which rules fired how often, latency
percentiles, the degraded rows to look at first, and the most-blocked
payees. This file is also what your FMR filings and dispute defences
are built from — the `evidence` numbers are the justification, not just
prose. It contains raw identifiers, so it stays inside your perimeter.

---

## Step 9 — From demo to production

- **Kubernetes:** `deploy/k8s.yaml` is the reference shape — liveness on
  `/healthz`, readiness on `/readyz`, non-root, no CPU limit (don't
  throttle the hot path), persistent volumes where they belong.
- **In-process instead of HTTP:** the library path is the intended
  integration — `npm install @krediwall/core @krediwall/telemetry-rules @krediwall/enterprise-proxy`
  and call the adapter directly
  from your switch, in the same process. Microsecond checks with no
  network hop.
- **The grown-up manual:** [integration guide](integration-guide.md) —
  deployment shapes, restarts/HA, feed operations, and the honest
  limits table. [API contract](api/openapi.yaml) for your gateway and
  codegen.

**When you're serious, the honest checklist:** replay your traffic
(Step 7) before trusting BLOCK rates, size `maxTrackedLines` to your
line population, wire the audit hook to your own queue, and keep the
feed fresh on your pipeline's cadence.
