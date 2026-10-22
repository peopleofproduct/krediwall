# @krediwall/telemetry-rules

Local in-memory velocity and heuristic rules for
[Krediwall](https://github.com/peopleofproduct/krediwall), an open-source
in-process fraud firewall for credit-funded UPI payments.

Zero runtime dependencies. Ships `velocitySpike` (fanout across distinct
payees/geo cells inside a window) and `muleDrain` (repeat band tickets
burning most of a fresh credit line's limit), plus the bounded data
structures they run on (`RingBuffer`, `LruMap`) and a JSON ruleset loader
(`loadRulesConfigFile`) so ops can tune thresholds without a code change.

```ts
import { creditOnUpiRules } from '@krediwall/telemetry-rules';

const rules = creditOnUpiRules(); // illustrative starter thresholds
```

Thresholds are illustrative — calibrate against your own traffic.

Apache-2.0 — see LICENSE. Copyright 2026 Kapil.
