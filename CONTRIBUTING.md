# Contributing to Krediwall

Thanks for your interest. Krediwall is an alpha, open-core fraud firewall for credit-funded UPI payments.

## Current status: issues welcome, code contributions not yet

**We are not merging external code contributions yet.** Before we do, we are putting a Contributor Licence Agreement (CLA) in place so that the project can evolve its licensing without needing every contributor's separate consent. Once it is live, this file will say how to sign it.

In the meantime we would love:

- bug reports and reproductions;
- rule ideas and descriptions of fraud patterns you see in credit-funded UPI (no real customer data — see below);
- pointers to public datasets suitable for calibrating thresholds;
- feedback on the docs, especially anything unclear or factually wrong (please cite a source).

Open a GitHub issue. For security problems, do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Development setup

```bash
npm ci
npm run build   # tsc -b across all workspaces
npm test        # jest — must stay green
npm run demo    # replays four illustrative scenarios
npm run bench   # latency benchmark (run on a quiet machine)
```

## Ground rules (for when contributions open)

- **Strict TypeScript** — no `any`; use `unknown` at external boundaries.
- **Zero runtime dependencies** in `packages/core` and `packages/telemetry-rules`. Node built-ins only.
- **No outbound network calls, telemetry or logging** in `core`, `telemetry-rules` or `dpi-adapters`. The HTTP gateway only listens when an integrator calls `.listen()`.
- **Synthetic data only.** Never commit real VPAs, mobile numbers, account numbers, names or transaction data — in code, tests, fixtures or issues.
- **Hot-path changes need numbers.** If you touch `engine.ts`, `ringBuffer.ts`, `lruMap.ts` or a rule's `evaluate`, include `npm run bench` output before and after.
- **Tests with every behaviour change**, including a test that would have failed before the fix.
- **Claims need sources.** Docs that state a regulation, statistic or competitor fact must cite it.

## Writing a rule

Implement the `Rule` interface from `@krediwall/core`. Keep per-entity state in fixed-size structures (`RingBuffer`) behind a capped map (`LruMap`), avoid closures and allocations in `evaluate`, and tolerate out-of-order timestamps without corrupting state.

## Licence

By contributing you will agree that your contribution is licensed under the Apache License 2.0 and covered by the project's CLA. The names Panini, Krediwall and People of Product are not licensed by Apache-2.0; see [TRADEMARKS.md](TRADEMARKS.md).
