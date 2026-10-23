import type { Rule } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';
import { hashVpa } from './vpaHash';

export interface FirstPayeeOptions {
  /**
   * Flag when a first-seen payee pulls at least this fraction of the
   * sanctioned limit in one authorisation. Default 0.5.
   */
  readonly minAmountRatio?: number;
  /** Verdict to emit. Default REVIEW — large first payments are often legitimate. */
  readonly verdict?: Verdict;
  /** Distinct payee hashes remembered per line. Default 128. */
  readonly maxPayeesPerLine?: number;
  /** Max credit lines tracked at once (LRU-evicted). Default 100,000. */
  readonly maxTrackedLines?: number;
}

/** Snapshot form: `[creditLineId, payeeHashArray]` pairs, LRU-order preserved. */
type FirstPayeeState = ReadonlyArray<readonly [string, number[]]>;

/**
 * First-payee large transfer: a credit line paying a counterparty it has
 * never paid before, immediately for a large share of its limit. The most
 * common mule-drain shape — money goes to a fresh mule account, not to an
 * established merchant the line already uses.
 *
 * Kept to REVIEW by default: plenty of legitimate first payments are large
 * (appliance purchase, rent). Combine with muleDrain/velocity for the
 * stronger multi-signal blocks.
 */
export function firstPayee(options: FirstPayeeOptions = {}): Rule {
  const name = 'telemetry.first-payee';
  const minRatio = options.minAmountRatio ?? 0.5;
  const verdict = options.verdict ?? Verdict.Review;
  const maxPayees = options.maxPayeesPerLine ?? 128;
  const lines = new LruMap<string, Set<number>>(options.maxTrackedLines ?? 100_000);

  return {
    name,
    evaluate(txn, _ctx) {
      if (txn.creditLimitPaise <= 0) return null;
      let seen = lines.get(txn.creditLineId);
      if (seen === undefined) {
        seen = new Set();
        lines.set(txn.creditLineId, seen);
      }
      const payeeHash = hashVpa(txn.payeeVpa);
      const isFirstSeen = !seen.has(payeeHash);
      if (seen.size < maxPayees) {
        seen.add(payeeHash);
      } else if (isFirstSeen) {
        // Set preserves insertion order: drop the oldest hash to stay bounded.
        seen.delete(seen.values().next().value!);
        seen.add(payeeHash);
      }
      if (!isFirstSeen || txn.amountPaise < minRatio * txn.creditLimitPaise) {
        return null;
      }
      const amountPct = (txn.amountPaise / txn.creditLimitPaise) * 100;
      return {
        rule: name,
        verdict,
        reason: `first-seen payee drawing ${amountPct.toFixed(0)}% of limit`,
        evidence: {
          firstSeenPayee: 1,
          amountPctOfLimit: Math.round(amountPct),
          seenPayees: seen.size,
        },
      };
    },
    reset() {
      lines.clear();
    },
    stats() {
      return {
        trackedLines: lines.size,
        maxTrackedLines: lines.maxEntries,
        evictedLines: lines.evictedCount,
      };
    },
    exportState(): FirstPayeeState {
      const out: Array<[string, number[]]> = [];
      for (const [key, seen] of lines.entriesLeastRecentFirst()) {
        out.push([key, [...seen]]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('first-payee: bad snapshot shape');
      lines.clear();
      for (const entry of state as FirstPayeeState) {
        const [key, hashes] = entry;
        if (typeof key !== 'string' || !Array.isArray(hashes)) continue;
        const seen = new Set<number>();
        for (const h of hashes.slice(-maxPayees)) {
          if (typeof h === 'number' && Number.isFinite(h)) seen.add(h);
        }
        lines.set(key, seen);
      }
    },
  };
}
