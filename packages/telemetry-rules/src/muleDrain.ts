import type { Rule, Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';
import { RingBuffer } from './ringBuffer';

export interface MuleDrainOptions {
  /** Fraction of sanctioned limit drained inside the window that flags. */
  readonly limitBurnRatio: number;
  /** Sliding window in milliseconds. */
  readonly windowMs: number;
  /** Lower bound (paise) of the suspicious repeated-ticket band. */
  readonly ticketFloorPaise: number;
  /** Upper bound (paise) of the suspicious repeated-ticket band. */
  readonly ticketCeilPaise: number;
  /** Minimum repeat tickets inside the band required to flag. */
  readonly minRepeats: number;
  /**
   * Max age (ms) for a line to count as "freshly approved". When set and the
   * transaction carries `creditLineApprovedAtMs`, a drain pattern on an
   * older line is downgraded to REVIEW instead of BLOCK — still anomalous,
   * but the signature fraud pattern targets fresh disbursements.
   */
  readonly freshLineMaxAgeMs?: number;
  /**
   * Transactions remembered per line (16 bytes per slot). If more than this
   * many arrive inside the window, the oldest are dropped and burn is
   * under-counted (the rule errs towards not flagging). Default 32.
   */
  readonly capacity?: number;
  /** Max credit lines tracked at once (LRU-evicted). Default 100,000. */
  readonly maxTrackedLines?: number;
}

/**
 * Rapid multi-mule drain: a credit line firing repeated tickets inside a
 * configurable amount band at unverified terminals, burning ≥
 * `limitBurnRatio` of the sanctioned limit inside a sliding window.
 *
 * The band and thresholds are illustrative defaults, not tuned on
 * production data — calibrate them against your own ticket distribution.
 *
 * Only transactions to unverified terminals are recorded; verified
 * terminals short-circuit the rule because this pattern is about
 * unestablished merchant identity.
 */
/** Snapshot form: `[creditLineId, ringEntries]` pairs, LRU-order preserved. */
type MuleDrainState = ReadonlyArray<readonly [string, Array<[number, number]>]>;

export function muleDrain(options: MuleDrainOptions): Rule {
  const name = 'telemetry.mule-drain';
  const capacity = options.capacity ?? 32;
  const lines = new LruMap<string, RingBuffer>(options.maxTrackedLines ?? 100_000);

  const isFresh = (txn: Transaction, nowMs: number): boolean => {
    if (options.freshLineMaxAgeMs === undefined) return true;
    if (txn.creditLineApprovedAtMs === undefined) return true; // unknown age → assume fresh (conservative)
    return nowMs - txn.creditLineApprovedAtMs <= options.freshLineMaxAgeMs;
  };

  return {
    name,
    evaluate(txn, ctx) {
      if (txn.terminalVerified || txn.creditLimitPaise <= 0) return null;

      let ring = lines.get(txn.creditLineId);
      if (ring === undefined) {
        ring = new RingBuffer(capacity);
        lines.set(txn.creditLineId, ring);
      }
      ring.push(ctx.nowMs, txn.amountPaise);

      const n = ring.countWithin(options.windowMs, ctx.nowMs);
      let totalPaise = 0;
      let bandTickets = 0;
      for (let i = 0; i < n; i++) {
        const amount = ring.auxAt(i);
        totalPaise += amount;
        if (amount >= options.ticketFloorPaise && amount <= options.ticketCeilPaise) {
          bandTickets += 1;
        }
      }

      const burned = totalPaise / txn.creditLimitPaise;
      if (bandTickets >= options.minRepeats && burned >= options.limitBurnRatio) {
        const fresh = isFresh(txn, ctx.nowMs);
        return {
          rule: name,
          verdict: fresh ? Verdict.Block : Verdict.Review,
          reason:
            `${(burned * 100).toFixed(1)}% of limit burned via ${bandTickets} ` +
            `repeat band tickets to unverified terminal${fresh ? '' : ' (stale credit line)'}`,
        };
      }
      return null;
    },
    reset() {
      lines.clear();
    },
    exportState(): MuleDrainState {
      const out: Array<[string, Array<[number, number]>]> = [];
      for (const [key, ring] of lines.entriesLeastRecentFirst()) {
        out.push([key, ring.toEntries()]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('mule-drain: bad snapshot shape');
      lines.clear();
      for (const entry of state as MuleDrainState) {
        const [key, entries] = entry;
        if (typeof key !== 'string' || !Array.isArray(entries)) continue;
        const ring = new RingBuffer(capacity);
        ring.loadEntries(entries);
        lines.set(key, ring);
      }
    },
  };
}
