import { Verdict } from '@vayu/core';
import type { Transaction } from '@vayu/core';
import { chakshuFeed, feedReputationRule, friFeed } from '../src/feed';

const txn = (payeeVpa: string): Transaction => ({
  txnId: 'txn-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa,
  amountPaise: 10_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
});

describe('fraud feeds', () => {
  it('returns null for VPAs absent from the snapshot', () => {
    const feed = chakshuFeed('salt');
    feed.ingest([{ vpa: 'mule@ybl', listed: true, riskScore: 1 }]);
    expect(feed.lookup('clean@paytm')).toBeNull();
  });

  it('finds listed VPAs after ingest', () => {
    const feed = friFeed('salt');
    feed.ingest([{ vpa: 'mule@ybl', listed: true, riskScore: 0.95 }]);
    expect(feed.lookup('mule@ybl')).toEqual({ listed: true, riskScore: 0.95 });
  });
});

describe('feedReputationRule', () => {
  it('blocks payees listed on any feed', () => {
    const feed = friFeed('salt');
    feed.ingest([{ vpa: 'mule@ybl', listed: true, riskScore: 1 }]);
    const rule = feedReputationRule([feed]);
    const hit = rule.evaluate(txn('mule@ybl'), { nowMs: 0 });
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('reviews high-risk unlisted payees', () => {
    const feed = chakshuFeed('salt');
    feed.ingest([{ vpa: 'shady@okicici', listed: false, riskScore: 0.8 }]);
    const rule = feedReputationRule([feed]);
    const hit = rule.evaluate(txn('shady@okicici'), { nowMs: 0 });
    expect(hit?.verdict).toBe(Verdict.Review);
  });

  it('allows clean payees', () => {
    const rule = feedReputationRule([chakshuFeed('salt')]);
    expect(rule.evaluate(txn('clean@paytm'), { nowMs: 0 })).toBeNull();
  });
});
