# @krediwall/enterprise-proxy

The integration surface for [Krediwall](https://github.com/peopleofproduct/krediwall):
`KrediwallAdapter` wraps the core engine in the switch-pipeline shape
(`handleTransaction` in, `Evaluation` out) plus the seams a deployment
needs —

- `createHttpAdapter` — minimal `node:http` gateway: `POST /v1/evaluate`,
  `GET /healthz`, `GET /metrics` (Prometheus text)
- `saveStateToFile` / `restoreStateFromFile` — atomic on-disk state for
  restart warm-up
- `renderPrometheus` — engine and rule counters for your own scrape
  endpoint
- `GraphEvaluator` — the provisional contract the commercial mule-ring
  scorer implements (unchecked stub until wired)
- `complianceHooks` — CERT-In 6-hour and FMR 14-day deadline helpers
- `billingMeter` — throughput accounting for the commercial tier

```ts
const adapter = new KrediwallAdapter(creditOnUpiRules());
createHttpAdapter(adapter).listen(8080);
```

The HTTP gateway has no auth or TLS — bind loopback and front it with your
own controls. See the
[integration guide](https://github.com/peopleofproduct/krediwall/blob/main/docs/integration-guide.md).

Apache-2.0 — see LICENSE. Copyright 2026 Kapil.
