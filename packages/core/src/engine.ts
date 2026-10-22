import type { Evaluation, Rule, RuleContext, RuleHit, Transaction } from './types';
import { Verdict } from './types';

const EMPTY_HITS: readonly RuleHit[] = [];

const severity = (v: Verdict): number =>
  v === Verdict.Block ? 2 : v === Verdict.Review ? 1 : 0;

/**
 * Synchronous in-memory evaluation loop.
 *
 * Rules run in registration order. The loop short-circuits on the first
 * BLOCK, since no subsequent rule can produce a worse verdict. The hot path
 * is allocation-light, not allocation-free: each call creates one small
 * context object and one result object, and the hit list is created lazily
 * on the first positive firing. Measure real latency with `npm run bench`.
 */
export class FirewallEngine {
  private readonly rules: readonly Rule[];
  private evaluated = 0;

  constructor(rules: readonly Rule[]) {
    this.rules = rules.slice();
  }

  get evaluatedCount(): number {
    return this.evaluated;
  }

  evaluate(txn: Transaction): Evaluation {
    const start = performance.now();
    const ctx: RuleContext = { nowMs: txn.timestampMs };
    let worst = Verdict.Allow;
    let hits: RuleHit[] | null = null;

    for (const rule of this.rules) {
      const hit = rule.evaluate(txn, ctx);
      if (hit !== null) {
        (hits ??= []).push(hit);
        if (severity(hit.verdict) > severity(worst)) {
          worst = hit.verdict;
          if (worst === Verdict.Block) break;
        }
      }
    }

    this.evaluated += 1;
    return {
      verdict: worst,
      hits: hits ?? EMPTY_HITS,
      elapsedMicros: (performance.now() - start) * 1000,
    };
  }

  reset(): void {
    this.evaluated = 0;
    for (const rule of this.rules) rule.reset?.();
  }
}
