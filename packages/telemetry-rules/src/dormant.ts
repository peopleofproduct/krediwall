import type { Rule } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';

export interface DormantOptions {
  /** Line idle at least this long counts as dormant. Default 90 days. */
  readonly dormantMs?: number;
  /**
   * Only flag when the reactivating transaction is at least this many
   * paise. Default 0 — a probing ₹1 on a dormant line is itself a signal,
   * so any activity flags.
   */
  readonly minAmountPaise?: number;
  /** Verdict to emit. Default REVIEW. */
  readonly verdict?: Verdict;
  /** Max credit lines tracked at once (LRU-evicted). Default 100,000. */
  readonly maxTrackedLines?: number;
}

/** Snapshot form: `[creditLineId, lastSeenMs]` pairs, LRU-order preserved. */
type DormantState = ReadonlyArray<readonly [string, number]>;

/**
 * Dormant-line reactivation: a credit line with no activity for
 * `dormantMs` suddenly transacting. Compromised or forgotten sanctioned
 * lines are prime drain targets — the first spend after months of silence
 * deserves a second look.
 *
 * A line evicted from the LRU looks "never seen", so it cannot trigger —
 * evicted history restarts, erring toward not flagging.
 */
export function dormantReactivation(options: DormantOptions = {}): Rule {
  const name = 'telemetry.dormant-reactivation';
  const dormantMs = options.dormantMs ?? 90 * 86_400_000;
  const minAmount = options.minAmountPaise ?? 0;
  const verdict = options.verdict ?? Verdict.Review;
  const lines = new LruMap<string, number>(options.maxTrackedLines ?? 100_000);

  return {
    name,
    evaluate(txn, ctx) {
      const prev = lines.get(txn.creditLineId);
      lines.set(txn.creditLineId, ctx.nowMs);
      if (prev === undefined || txn.amountPaise < minAmount) return null;
      const idleMs = ctx.nowMs - prev;
      if (idleMs < dormantMs) return null;
      const idleDays = Math.round(idleMs / 86_400_000);
      return {
        rule: name,
        verdict,
        reason: `line reactivated after ${idleDays}d idle (threshold ${Math.round(dormantMs / 86_400_000)}d)`,
        evidence: { idleDays, idleMs, dormantDays: Math.round(dormantMs / 86_400_000) },
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
    exportState(): DormantState {
      const out: Array<[string, number]> = [];
      for (const [key, lastSeen] of lines.entriesLeastRecentFirst()) {
        out.push([key, lastSeen]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('dormant-reactivation: bad snapshot shape');
      lines.clear();
      for (const entry of state as DormantState) {
        const [key, lastSeen] = entry;
        if (typeof key !== 'string' || typeof lastSeen !== 'number' || !Number.isFinite(lastSeen)) {
          continue;
        }
        lines.set(key, lastSeen);
      }
    },
  };
}
