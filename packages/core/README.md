# @krediwall/core

The evaluation loop and verdict types for [Krediwall](https://github.com/peopleofproduct/krediwall),
an open-source in-process fraud firewall for credit-funded UPI payments.

Zero runtime dependencies. `FirewallEngine` runs `Rule`s in registration
order, folds their hits into `ALLOW`/`REVIEW`/`BLOCK`, isolates rules that
throw, and exposes audit hooks, metrics counters and
`exportState`/`restoreState` for restart warm-up.

```ts
import { FirewallEngine } from '@krediwall/core';

const engine = new FirewallEngine(rules, {
  onEvaluation: (evaluation) => auditQueue.push(evaluation),
});
const verdict = engine.evaluate(txn); // synchronous, microseconds
```

Docs: [repository README](https://github.com/peopleofproduct/krediwall#readme) ·
[integration guide](https://github.com/peopleofproduct/krediwall/blob/main/docs/integration-guide.md)

Apache-2.0 — see LICENSE. Copyright 2026 Kapil.
