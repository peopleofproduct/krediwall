import type { Evaluation, Rule, RuleContext, RuleError, RuleHit, Transaction } from './types';
import { Verdict } from './types';

const EMPTY_HITS: readonly RuleHit[] = [];
const EMPTY_ERRORS: readonly RuleError[] = [];

const severity = (v: Verdict): number =>
  v === Verdict.Block ? 2 : v === Verdict.Review ? 1 : 0;

/** Integrator hooks. Both are called synchronously — keep them non-blocking. */
export interface FirewallEngineOptions {
  /**
   * Called once per evaluation with the completed result and the request.
   * This is the audit-trail seam: hand the record to your own queue or
   * writer; a throwing hook is caught and counted (see `hookErrorCount`)
   * so a faulty sink cannot break the hot path.
   */
  readonly onEvaluation?: (evaluation: Evaluation, txn: Transaction) => void;
  /** Called when a rule throws; the rule is skipped and evaluation continues. */
  readonly onRuleError?: (rule: string, error: unknown) => void;
}

/** Portable engine state: per-rule snapshots keyed by rule name. */
export interface EngineSnapshot {
  readonly version: 1;
  readonly exportedAtMs: number;
  readonly rules: Readonly<Record<string, unknown>>;
}

const isWellFormed = (txn: Transaction): boolean =>
  typeof txn.txnId === 'string' &&
  typeof txn.creditLineId === 'string' &&
  txn.creditLineId.length > 0 &&
  typeof txn.payerVpa === 'string' &&
  typeof txn.payeeVpa === 'string' &&
  typeof txn.terminalVerified === 'boolean' &&
  Number.isFinite(txn.amountPaise) &&
  Number.isFinite(txn.creditLimitPaise) &&
  Number.isFinite(txn.timestampMs);

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Synchronous in-memory evaluation loop.
 *
 * Rules run in registration order. A throwing rule is isolated: it is
 * recorded in `ruleErrors`, reported through `onRuleError`, and the loop
 * continues — one broken rule must not take the pipeline down, and its
 * absence is visible in the result so it fails loudly in telemetry rather
 * than silently degrading coverage.
 *
 * The loop short-circuits on the first BLOCK, since no subsequent rule can
 * produce a worse verdict. The hot path is allocation-light, not
 * allocation-free: each call creates one small context object and one
 * result object, and the hit list is created lazily on the first positive
 * firing. Measure real latency with `npm run bench`.
 */
export class FirewallEngine {
  private readonly rules: readonly Rule[];
  private readonly onEvaluation?: FirewallEngineOptions['onEvaluation'];
  private readonly onRuleError?: FirewallEngineOptions['onRuleError'];
  private evaluated = 0;
  private hookErrors = 0;

  constructor(rules: readonly Rule[], options?: FirewallEngineOptions) {
    this.rules = rules.slice();
    this.onEvaluation = options?.onEvaluation;
    this.onRuleError = options?.onRuleError;
  }

  get evaluatedCount(): number {
    return this.evaluated;
  }

  /** Times `onEvaluation` threw. Nonzero means audit records were dropped. */
  get hookErrorCount(): number {
    return this.hookErrors;
  }

  evaluate(txn: Transaction): Evaluation {
    const start = performance.now();
    const ctx: RuleContext = { nowMs: txn.timestampMs };
    let worst = Verdict.Allow;
    let hits: RuleHit[] | null = null;
    let errors: RuleError[] | null = null;

    if (!isWellFormed(txn)) {
      // Malformed input must never sail through as ALLOW; REVIEW forces a
      // human/secondary look without hard-blocking on a parsing quirk.
      errors = [{ rule: 'engine', message: 'malformed transaction fields' }];
      worst = Verdict.Review;
    } else {
      for (const rule of this.rules) {
        let hit: RuleHit | null;
        try {
          hit = rule.evaluate(txn, ctx);
        } catch (e) {
          (errors ??= []).push({ rule: rule.name, message: errorMessage(e) });
          try {
            this.onRuleError?.(rule.name, e);
          } catch {
            this.hookErrors += 1;
          }
          continue;
        }
        if (hit !== null) {
          (hits ??= []).push(hit);
          if (severity(hit.verdict) > severity(worst)) {
            worst = hit.verdict;
            if (worst === Verdict.Block) break;
          }
        }
      }
    }

    this.evaluated += 1;
    const evaluation: Evaluation = {
      verdict: worst,
      hits: hits ?? EMPTY_HITS,
      ruleErrors: errors ?? EMPTY_ERRORS,
      elapsedMicros: (performance.now() - start) * 1000,
    };
    if (this.onEvaluation !== undefined) {
      try {
        this.onEvaluation(evaluation, txn);
      } catch {
        this.hookErrors += 1;
      }
    }
    return evaluation;
  }

  /**
   * Per-rule state for restart warm-up or replica seeding. Rules without
   * `exportState` contribute nothing; a restored engine replays no history.
   * Keep the snapshot in your own store — it is never written anywhere by
   * the engine itself.
   */
  exportState(): EngineSnapshot {
    const rules: Record<string, unknown> = {};
    for (const rule of this.rules) {
      const state = rule.exportState?.();
      if (state !== undefined) rules[rule.name] = state;
    }
    return { version: 1, exportedAtMs: Date.now(), rules };
  }

  /**
   * Replace rule state from `exportState()` output. Unknown or absent rule
   * names are ignored; version mismatches throw.
   */
  restoreState(snapshot: EngineSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`unsupported snapshot version ${String(snapshot.version)}`);
    }
    for (const rule of this.rules) {
      const state = snapshot.rules[rule.name];
      if (state !== undefined) rule.restoreState?.(state);
    }
  }

  reset(): void {
    this.evaluated = 0;
    this.hookErrors = 0;
    for (const rule of this.rules) rule.reset?.();
  }
}
