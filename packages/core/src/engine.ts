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
  /**
   * Switch retries can replay the same authorisation; without dedupe the
   * second copy lands in rule state again and double-counts velocity and
   * burn. Set a capacity (e.g. 10_000) and a repeat `txnId` returns the
   * original evaluation verbatim — state is not polluted and the verdict
   * stays consistent for a retried leg.
   */
  readonly dedupeCapacity?: number;
}

/** Portable engine state: per-rule snapshots keyed by rule name. */
export interface EngineSnapshot {
  readonly version: 1;
  readonly exportedAtMs: number;
  readonly rules: Readonly<Record<string, unknown>>;
}

/** Lifetime counters for observability. Read rarely; the hot path only increments. */
export interface EngineMetrics {
  readonly evaluated: number;
  readonly verdicts: {
    readonly allow: number;
    readonly review: number;
    readonly block: number;
  };
  /** Positive firings per rule name. */
  readonly ruleHits: Readonly<Record<string, number>>;
  /** Throws per rule name. Nonzero means degraded coverage — alert on it. */
  readonly ruleErrors: Readonly<Record<string, number>>;
  /** Times a hook threw. Nonzero means audit records were dropped. */
  readonly hookErrors: number;
  /** Repeated txnIds answered from cache (only when dedupe is enabled). */
  readonly deduped: number;
  /**
   * Evaluation latency histogram in microseconds. `buckets` are the
   * upper bounds; `counts[i]` counts evaluations ≤ buckets[i], and the
   * last count is the +Inf overflow.
   */
  readonly latencyMicros: {
    readonly buckets: readonly number[];
    readonly counts: readonly number[];
    readonly sum: number;
  };
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

/** Latency histogram upper bounds in microseconds; last count is +Inf. */
const LATENCY_BUCKETS: readonly number[] = [100, 250, 500, 1_000, 2_500, 5_000, 10_000];

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
  private allowCount = 0;
  private reviewCount = 0;
  private blockCount = 0;
  private dedupedCount = 0;
  private readonly latencyCounts = new Array<number>(LATENCY_BUCKETS.length + 1).fill(0);
  private latencySum = 0;
  private readonly hitCounts = new Map<string, number>();
  private readonly errorCounts = new Map<string, number>();
  private readonly seenTxns: Map<string, Evaluation> | undefined;
  private readonly dedupeCap: number;

  constructor(rules: readonly Rule[], options?: FirewallEngineOptions) {
    this.rules = rules.slice();
    this.onEvaluation = options?.onEvaluation;
    this.onRuleError = options?.onRuleError;
    const cap = options?.dedupeCapacity;
    this.seenTxns = cap !== undefined && cap > 0 ? new Map() : undefined;
    this.dedupeCap = cap ?? 0;
    for (const rule of this.rules) {
      this.hitCounts.set(rule.name, 0);
      this.errorCounts.set(rule.name, 0);
    }
  }

  get evaluatedCount(): number {
    return this.evaluated;
  }

  /** Times `onEvaluation` threw. Nonzero means audit records were dropped. */
  get hookErrorCount(): number {
    return this.hookErrors;
  }

  /** Lifetime counters — a fresh object per call; read on a scrape cadence. */
  get metrics(): EngineMetrics {
    const ruleHits: Record<string, number> = {};
    const ruleErrors: Record<string, number> = {};
    for (const rule of this.rules) {
      ruleHits[rule.name] = this.hitCounts.get(rule.name) ?? 0;
      ruleErrors[rule.name] = this.errorCounts.get(rule.name) ?? 0;
    }
    return {
      evaluated: this.evaluated,
      verdicts: { allow: this.allowCount, review: this.reviewCount, block: this.blockCount },
      ruleHits,
      ruleErrors,
      hookErrors: this.hookErrors,
      deduped: this.dedupedCount,
      latencyMicros: {
        buckets: LATENCY_BUCKETS,
        counts: this.latencyCounts.slice(),
        sum: this.latencySum,
      },
    };
  }

  /**
   * Per-rule internal counters (tracked lines, evictions) keyed by rule
   * name, for rules that expose `stats()`. Empty when none do.
   */
  ruleStats(): Readonly<Record<string, Readonly<Record<string, number>>>> {
    const out: Record<string, Readonly<Record<string, number>>> = {};
    for (const rule of this.rules) {
      const stats = rule.stats?.();
      if (stats !== undefined) out[rule.name] = stats;
    }
    return out;
  }

  evaluate(txn: Transaction): Evaluation {
    const start = performance.now();
    if (this.seenTxns !== undefined) {
      const prev = this.seenTxns.get(txn.txnId);
      if (prev !== undefined) {
        this.dedupedCount += 1;
        return prev;
      }
    }
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
          this.errorCounts.set(rule.name, (this.errorCounts.get(rule.name) ?? 0) + 1);
          try {
            this.onRuleError?.(rule.name, e);
          } catch {
            this.hookErrors += 1;
          }
          continue;
        }
        if (hit !== null) {
          this.hitCounts.set(hit.rule, (this.hitCounts.get(hit.rule) ?? 0) + 1);
          (hits ??= []).push(hit);
          if (severity(hit.verdict) > severity(worst)) {
            worst = hit.verdict;
            if (worst === Verdict.Block) break;
          }
        }
      }
    }

    this.evaluated += 1;
    if (worst === Verdict.Block) this.blockCount += 1;
    else if (worst === Verdict.Review) this.reviewCount += 1;
    else this.allowCount += 1;
    const elapsed = (performance.now() - start) * 1000;
    this.latencySum += elapsed;
    let bucket = 0;
    while (bucket < LATENCY_BUCKETS.length && elapsed > LATENCY_BUCKETS[bucket]!) bucket += 1;
    this.latencyCounts[bucket]! += 1;
    const evaluation: Evaluation = {
      verdict: worst,
      hits: hits ?? EMPTY_HITS,
      ruleErrors: errors ?? EMPTY_ERRORS,
      degraded: errors !== null,
      elapsedMicros: elapsed,
    };
    if (this.seenTxns !== undefined) {
      this.seenTxns.set(txn.txnId, evaluation);
      // Map preserves insertion order: the first key is the oldest — a
      // FIFO cap, which is all a retry-dedupe window needs.
      if (this.seenTxns.size > this.dedupeCap) {
        this.seenTxns.delete(this.seenTxns.keys().next().value!);
      }
    }
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
    this.allowCount = 0;
    this.reviewCount = 0;
    this.blockCount = 0;
    this.dedupedCount = 0;
    this.latencyCounts.fill(0);
    this.latencySum = 0;
    this.seenTxns?.clear();
    this.hitCounts.clear();
    this.errorCounts.clear();
    for (const rule of this.rules) {
      this.hitCounts.set(rule.name, 0);
      this.errorCounts.set(rule.name, 0);
      rule.reset?.();
    }
  }
}
