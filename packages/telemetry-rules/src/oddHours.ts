import type { Rule } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

const istHour = (timestampMs: number): number =>
  Math.floor((((timestampMs + IST_OFFSET_MS) % DAY_MS) + DAY_MS) / 3_600_000) % 24;

export interface OddHoursOptions {
  /**
   * IST hour band treated as unusual activity, `[startHour, endHour]`
   * inclusive of start, exclusive of end; wraps past midnight when
   * `start > end`. Default [0, 5) — midnight to 5am IST.
   */
  readonly oddHoursIst?: readonly [number, number];
  /**
   * Only flag when the transaction is at least this fraction of the
   * sanctioned limit. Default 0 — any odd-hours spend on a line that
   * never transacts at night is a signal.
   */
  readonly minAmountRatio?: number;
  /** Verdict to emit. Default REVIEW. */
  readonly verdict?: Verdict;
  /** Max credit lines tracked at once (LRU-evicted). Default 100,000. */
  readonly maxTrackedLines?: number;
}

/** Snapshot form: `[creditLineId, hourBitmap]` pairs, LRU-order preserved. */
type OddHoursState = ReadonlyArray<readonly [string, number]>;

/**
 * Odd-hours activity: a transaction landing inside an unusual-time band
 * (default: midnight–5am IST) on a credit line that has never transacted
 * there before. Mule drains run at night partly because review queues
 * are thin; a line's own history is the baseline, not a global profile.
 *
 * Per-line state is one 24-bit bitmap — 4 bytes of state per line.
 */
export function oddHours(options: OddHoursOptions = {}): Rule {
  const name = 'telemetry.odd-hours';
  const [start, end] = options.oddHoursIst ?? [0, 5];
  const minRatio = options.minAmountRatio ?? 0;
  const verdict = options.verdict ?? Verdict.Review;
  const lines = new LruMap<string, number>(options.maxTrackedLines ?? 100_000);
  const inBand = (hour: number): boolean =>
    start <= end ? hour >= start && hour < end : hour >= start || hour < end;

  return {
    name,
    evaluate(txn, ctx) {
      const hour = istHour(ctx.nowMs);
      let bitmap = lines.get(txn.creditLineId) ?? 0;
      const bit = 1 << hour;
      const unusual = inBand(hour) && (bitmap & bit) === 0;
      bitmap |= bit;
      lines.set(txn.creditLineId, bitmap);
      if (
        !unusual ||
        txn.creditLimitPaise <= 0 ||
        txn.amountPaise < minRatio * txn.creditLimitPaise
      ) {
        return null;
      }
      return {
        rule: name,
        verdict,
        reason: `activity at ${hour}:00 IST on a line with no prior odd-hours history`,
        evidence: { istHour: hour, bandStart: start, bandEnd: end },
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
    exportState(): OddHoursState {
      const out: Array<[string, number]> = [];
      for (const [key, bitmap] of lines.entriesLeastRecentFirst()) {
        out.push([key, bitmap]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('odd-hours: bad snapshot shape');
      lines.clear();
      for (const entry of state as OddHoursState) {
        const [key, bitmap] = entry;
        if (typeof key !== 'string' || typeof bitmap !== 'number' || !Number.isInteger(bitmap)) {
          continue;
        }
        lines.set(key, bitmap & 0xffffff);
      }
    },
  };
}
