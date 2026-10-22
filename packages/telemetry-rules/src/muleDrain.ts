import type { Rule } from '@vayu/core';
import { Verdict } from '@vayu/core';

export interface MuleDrainOptions {
  /** Fraction of sanctioned limit drained inside the window that flags. */
  readonly limitBurnRatio: number;
  /** Sliding window in milliseconds. */
  readonly windowMs: number;
  /** Lower bound (paise) of the suspicious just-under-threshold ticket. */
  readonly ticketFloorPaise: number;
  /** Upper bound (paise) of the suspicious just-under-threshold ticket. */
  readonly ticketCeilPaise: number;
  /** Minimum repeat tickets inside the band required to flag. */
  readonly minRepeats: number;
}

interface LineState {
  windowStartMs: number;
  totalPaise: number;
  bandTickets: number;
}

/**
 * Rapid multi-mule drain: a credit line firing repeated just-under-threshold
 * tickets (e.g. ₹49,999 to duck a ₹50k reporting boundary) at unverified
 * terminals, burning ≥ `limitBurnRatio` of the sanctioned limit inside the
 * window.
 *
 * Verified terminals short-circuit the rule — this pattern only makes sense
 * where merchant identity is unestablished.
 */
export function muleDrain(options: MuleDrainOptions): Rule {
  const name = 'telemetry.mule-drain';
  const lines = new Map<string, LineState>();

  return {
    name,
    evaluate(txn, ctx) {
      if (txn.terminalVerified) return null;

      let s = lines.get(txn.creditLineId);
      if (s === undefined || ctx.nowMs - s.windowStartMs > options.windowMs) {
        s = { windowStartMs: ctx.nowMs, totalPaise: 0, bandTickets: 0 };
        lines.set(txn.creditLineId, s);
      }

      s.totalPaise += txn.amountPaise;
      if (
        txn.amountPaise >= options.ticketFloorPaise &&
        txn.amountPaise <= options.ticketCeilPaise
      ) {
        s.bandTickets += 1;
      }

      const burned = s.totalPaise / txn.creditLimitPaise;
      if (s.bandTickets >= options.minRepeats && burned >= options.limitBurnRatio) {
        return {
          rule: name,
          verdict: Verdict.Block,
          reason: `${(burned * 100).toFixed(1)}% of limit burned via ${s.bandTickets} repeat band tickets to unverified terminal`,
        };
      }
      return null;
    },
    reset() {
      lines.clear();
    },
  };
}
