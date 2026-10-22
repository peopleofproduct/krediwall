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

/** Normalise a VPA for storage/lookup: trimmed, lowercased, must contain '@'. */
export function normalizeVpa(vpa: string): string | null {
  const v = vpa.trim().toLowerCase();
  return v.length > 2 && v.includes('@') ? v : null;
}

/**
 * Integrator-supplied seam: resolve a non-phone payee VPA to its owner
 * mobile number — typically a lookup against the lender's own merchant
 * registry (every onboarded merchant has a mobile on file). Return null
 * when the VPA is unknown.
 */
export type VpaResolver = (payeeVpa: string) => string | null;

/**
 * A national fraud-intelligence feed. Implementations hold a local snapshot
 * keyed by mobile number and/or VPA. Obtaining the snapshot is the
 * integrator's job: FRI is delivered to onboarded stakeholders through
 * DoT's Digital Intelligence Platform, and there is no public API this
 * library calls.
 */
export interface FraudFeed {
  readonly source: string;
  lookup(mobile: string): FeedEntry | null;
  /**
   * Direct VPA match — for feeds that identify mule *accounts* rather
   * than phones (bank-internal blocklists, suspect registries). Optional;
   * a mobile-only feed simply does not implement it.
   */
  lookupVpa?(vpa: string): FeedEntry | null;
}

/**
 * Keyed-HMAC digest so raw numbers are not stored. This is obfuscation at
 * rest, not strong privacy: the 10-digit mobile space is small enough to
 * enumerate if `key` leaks, so keep it in a secret store.
 */
const digest = (key: string, mobile: string): string =>
  createHmac('sha256', key).update(mobile).digest('hex');

/** One ingest row: an identifier (mobile or VPA) plus its signal. */
export type FeedRow = (
  | { readonly mobile: string; readonly vpa?: string }
  | { readonly vpa: string; readonly mobile?: string }
) &
  FeedEntry;

/** In-memory snapshot lookup keyed by HMAC of the normalised identifier. */
export class InMemoryFeed implements FraudFeed {
  private readonly entries = new Map<string, FeedEntry>();

  constructor(
    readonly source: string,
    private readonly key: string,
  ) {}

  /**
   * Replace the snapshot. Rows may carry `mobile`, `vpa` or both; rows
   * whose identifiers all fail normalisation are rejected. The two
   * identifier spaces are namespaced so a mobile can never collide with
   * a VPA of the same string.
   */
  ingest(snapshot: ReadonlyArray<FeedRow>): {
    loaded: number;
    rejected: number;
  } {
    this.entries.clear();
    let loaded = 0;
    let rejected = 0;
    for (const row of snapshot) {
      const mobile = row.mobile !== undefined ? normalizeMobile(row.mobile) : null;
      const vpa = row.vpa !== undefined ? normalizeVpa(row.vpa) : null;
      if (mobile === null && vpa === null) {
        rejected += 1;
        continue;
      }
      const entry: FeedEntry = { listed: row.listed, riskScore: row.riskScore };
      if (mobile !== null) this.entries.set(digest(this.key, `m:${mobile}`), entry);
      if (vpa !== null) this.entries.set(digest(this.key, `v:${vpa}`), entry);
      loaded += 1;
    }
    return { loaded, rejected };
  }

  lookup(mobile: string): FeedEntry | null {
    const normalised = normalizeMobile(mobile);
    if (normalised === null) return null;
    return this.entries.get(digest(this.key, `m:${normalised}`)) ?? null;
  }

  lookupVpa(vpa: string): FeedEntry | null {
    const normalised = normalizeVpa(vpa);
    if (normalised === null) return null;
    return this.entries.get(digest(this.key, `v:${normalised}`)) ?? null;
  }
}

/** FRI snapshot feed (Chakshu and NCRP reports are inputs to FRI upstream). */
export const friFeed = (key: string): InMemoryFeed => new InMemoryFeed('fri', key);

export interface FeedReputationOptions {
  /**
   * Resolve a non-phone payee VPA to its owner mobile via the
   * integrator's own registry (merchant KYC data). Checked only when the
   * VPA handle is not itself a phone number.
   */
  readonly resolveMobile?: VpaResolver;
}

/**
 * Wraps feeds as a firewall rule: BLOCK on a listed identifier, REVIEW on
 * a risk score at or above `reviewThreshold`.
 *
 * Three ways to match a payee, in order: the mobile embedded in a
 * phone-number VPA; a mobile resolved from the integrator's registry via
 * `opts.resolveMobile`; a direct VPA match for feeds that carry
 * account-keyed rows. A payee matching none passes through unchecked.
 */
export function feedReputationRule(
  feeds: readonly FraudFeed[],
  reviewThreshold = 0.7,
  opts?: FeedReputationOptions,
): Rule {
  const name = 'dpi.feed-reputation';
  return {
    name,
    evaluate(txn: Transaction, _ctx: RuleContext): RuleHit | null {
      const mobile =
        mobileFromVpa(txn.payeeVpa) ?? opts?.resolveMobile?.(txn.payeeVpa) ?? null;
      const hasVpaFeeds = feeds.some((f) => f.lookupVpa !== undefined);
      if (mobile === null && !hasVpaFeeds) return null;

      let maxScore = 0;
      for (const feed of feeds) {
        const entry =
          (mobile !== null ? feed.lookup(mobile) : null) ??
          feed.lookupVpa?.(txn.payeeVpa) ??
          null;
        if (entry === null) continue;
        if (entry.listed) {
          return {
            rule: name,
            verdict: Verdict.Block,
            reason: `payee identifier listed on ${feed.source} feed`,
          };
        }
        if (entry.riskScore > maxScore) maxScore = entry.riskScore;
      }
      if (maxScore >= reviewThreshold) {
        return {
          rule: name,
          verdict: Verdict.Review,
          reason: `payee identifier feed risk score ${maxScore.toFixed(2)}`,
        };
      }
      return null;
    },
  };
}
