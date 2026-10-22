import type { Rule, RuleHit, RuleContext, Transaction } from '@vayu/core';
import { Verdict } from '@vayu/core';
import { createHash } from 'node:crypto';

/** Reputation signal for a single VPA from a national fraud feed. */
export interface FeedEntry {
  /** True when the VPA appears on the feed's blocklist. */
  readonly listed: boolean;
  /** Feed-provided risk score in [0, 1], when available. */
  readonly riskScore: number;
}

/**
 * A national fraud-intelligence feed adapter. Implementations hold a local
 * snapshot of listed VPAs (as salted hashes — raw VPAs are never stored)
 * refreshed out-of-band from the upstream source.
 */
export interface FraudFeed {
  readonly source: string;
  lookup(vpa: string): FeedEntry | null;
}

const digest = (salt: string, vpa: string): string =>
  createHash('sha256').update(`${salt}${vpa}`).digest('hex');

/** Shared in-memory snapshot lookup keyed by hashed VPA. */
export class InMemoryFeed implements FraudFeed {
  private readonly entries = new Map<string, FeedEntry>();

  constructor(
    readonly source: string,
    private readonly salt: string,
  ) {}

  /** Bulk-load a feed snapshot; replaces the previous one. */
  ingest(snapshot: ReadonlyArray<{ vpa: string } & FeedEntry>): void {
    this.entries.clear();
    for (const e of snapshot) {
      this.entries.set(digest(this.salt, e.vpa), {
        listed: e.listed,
        riskScore: e.riskScore,
      });
    }
  }

  lookup(vpa: string): FeedEntry | null {
    return this.entries.get(digest(this.salt, vpa)) ?? null;
  }
}

/** DoT Chakshu portal feed — citizen-reported suspected-fraud VPA lists. */
export const chakshuFeed = (salt: string): FraudFeed =>
  new InMemoryFeed('chakshu', salt);

/** NPCI/RBI Fraud Reporting Interface feed — confirmed mule VPAs. */
export const friFeed = (salt: string): FraudFeed =>
  new InMemoryFeed('fri', salt);

/**
 * Wraps feeds as a firewall rule: BLOCK on a listed VPA, REVIEW on a high
 * risk score. Kept here so feed wiring lives next to feed plumbing.
 */
export function feedReputationRule(
  feeds: readonly FraudFeed[],
  reviewThreshold = 0.7,
): Rule {
  const name = 'dpi.feed-reputation';
  return {
    name,
    evaluate(txn: Transaction, _ctx: RuleContext): RuleHit | null {
      let maxScore = 0;
      for (const feed of feeds) {
        const entry = feed.lookup(txn.payeeVpa);
        if (entry === null) continue;
        if (entry.listed) {
          return {
            rule: name,
            verdict: Verdict.Block,
            reason: `payee VPA listed on ${feed.source} feed`,
          };
        }
        if (entry.riskScore > maxScore) maxScore = entry.riskScore;
      }
      if (maxScore >= reviewThreshold) {
        return {
          rule: name,
          verdict: Verdict.Review,
          reason: `payee VPA feed risk score ${maxScore.toFixed(2)}`,
        };
      }
      return null;
    },
  };
}
