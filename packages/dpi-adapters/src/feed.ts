import type { Rule, RuleHit, RuleContext, Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { createHmac } from 'node:crypto';

/** Reputation signal for a single mobile number from a national fraud feed. */
export interface FeedEntry {
  /** True when the number is on a hard list (e.g. revoked / suspect registry). */
  readonly listed: boolean;
  /** Risk score in [0, 1]. */
  readonly riskScore: number;
}

/**
 * DoT's Financial Fraud Risk Indicator (FRI) classifies a *mobile number* as
 * Medium, High or Very High risk of financial fraud. These are DoT's levels;
 * the numeric scores below are Krediwall's own policy mapping, not a DoT value.
 */
export type FriLevel = 'medium' | 'high' | 'very_high';

const FRI_SCORES: Readonly<Record<FriLevel, number>> = {
  medium: 0.5,
  high: 0.75,
  very_high: 1,
};

export const friEntry = (level: FriLevel): FeedEntry => ({
  listed: false,
  riskScore: FRI_SCORES[level],
});

const MOBILE = /^(?:\+?91|0)?([6-9]\d{9})$/;

/** Normalise an Indian mobile number to its 10-digit form, or null. */
export function normalizeMobile(input: string): string | null {
  const m = MOBILE.exec(input.replace(/[\s\-()]/g, ''));
  return m?.[1] ?? null;
}

/**
 * Extract a mobile number from a VPA whose handle *is* a phone number
 * (`9876543210@ybl`, `+919876543210@paytm`). Returns null for any other VPA —
 * merchant and name-based handles cannot be resolved to a mobile number here,
 * so feed checks do not apply to them.
 */
export function mobileFromVpa(vpa: string): string | null {
  const at = vpa.indexOf('@');
  return at <= 0 ? null : normalizeMobile(vpa.slice(0, at));
}

/**
 * A national fraud-intelligence feed. Implementations hold a local snapshot
 * keyed by mobile number. Obtaining the snapshot is the integrator's job:
 * FRI is delivered to onboarded stakeholders through DoT's Digital
 * Intelligence Platform, and there is no public API this library calls.
 */
export interface FraudFeed {
  readonly source: string;
  lookup(mobile: string): FeedEntry | null;
}

/**
 * Keyed-HMAC digest so raw numbers are not stored. This is obfuscation at
 * rest, not strong privacy: the 10-digit mobile space is small enough to
 * enumerate if `key` leaks, so keep it in a secret store.
 */
const digest = (key: string, mobile: string): string =>
  createHmac('sha256', key).update(mobile).digest('hex');

/** In-memory snapshot lookup keyed by HMAC of the normalised mobile number. */
export class InMemoryFeed implements FraudFeed {
  private readonly entries = new Map<string, FeedEntry>();

  constructor(
    readonly source: string,
    private readonly key: string,
  ) {}

  /** Replace the snapshot. Rows whose number cannot be normalised are rejected. */
  ingest(snapshot: ReadonlyArray<{ readonly mobile: string } & FeedEntry>): {
    loaded: number;
    rejected: number;
  } {
    this.entries.clear();
    let loaded = 0;
    let rejected = 0;
    for (const row of snapshot) {
      const mobile = normalizeMobile(row.mobile);
      if (mobile === null) {
        rejected += 1;
        continue;
      }
      this.entries.set(digest(this.key, mobile), {
        listed: row.listed,
        riskScore: row.riskScore,
      });
      loaded += 1;
    }
    return { loaded, rejected };
  }

  lookup(mobile: string): FeedEntry | null {
    const normalised = normalizeMobile(mobile);
    if (normalised === null) return null;
    return this.entries.get(digest(this.key, normalised)) ?? null;
  }
}

/** FRI snapshot feed (Chakshu and NCRP reports are inputs to FRI upstream). */
export const friFeed = (key: string): InMemoryFeed => new InMemoryFeed('fri', key);

/**
 * Wraps feeds as a firewall rule: BLOCK on a listed number, REVIEW on a risk
 * score at or above `reviewThreshold`. Applies only when the payee VPA is
 * phone-number based; other payees pass through unchecked.
 */
export function feedReputationRule(
  feeds: readonly FraudFeed[],
  reviewThreshold = 0.7,
): Rule {
  const name = 'dpi.feed-reputation';
  return {
    name,
    evaluate(txn: Transaction, _ctx: RuleContext): RuleHit | null {
      const mobile = mobileFromVpa(txn.payeeVpa);
      if (mobile === null) return null;

      let maxScore = 0;
      for (const feed of feeds) {
        const entry = feed.lookup(mobile);
        if (entry === null) continue;
        if (entry.listed) {
          return {
            rule: name,
            verdict: Verdict.Block,
            reason: `payee mobile number listed on ${feed.source} feed`,
          };
        }
        if (entry.riskScore > maxScore) maxScore = entry.riskScore;
      }
      if (maxScore >= reviewThreshold) {
        return {
          rule: name,
          verdict: Verdict.Review,
          reason: `payee mobile number feed risk score ${maxScore.toFixed(2)}`,
        };
      }
      return null;
    },
  };
}
