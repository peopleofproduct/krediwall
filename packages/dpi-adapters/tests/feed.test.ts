import { Verdict } from '@krediwall/core';
import type { Transaction } from '@krediwall/core';
import {
  feedReputationRule,
  friEntry,
  friFeed,
  mobileFromVpa,
  normalizeMobile,
} from '../src/feed';

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

describe('mobile number handling', () => {
  it('normalises common Indian formats to 10 digits', () => {
    expect(normalizeMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizeMobile('09876543210')).toBe('9876543210');
    expect(normalizeMobile('919876543210')).toBe('9876543210');
  });

  it('rejects numbers that are not valid Indian mobiles', () => {
    expect(normalizeMobile('5876543210')).toBeNull();
    expect(normalizeMobile('98765')).toBeNull();
    expect(normalizeMobile('not-a-number')).toBeNull();
  });

  it('extracts a mobile only from phone-number VPA handles', () => {
    expect(mobileFromVpa('9876543210@ybl')).toBe('9876543210');
    expect(mobileFromVpa('+919876543210@paytm')).toBe('9876543210');
  });

  it('does not invent a mobile from merchant or mixed handles', () => {
    expect(mobileFromVpa('shop9876543210@okaxis')).toBeNull();
    expect(mobileFromVpa('merchant@paytm')).toBeNull();
    expect(mobileFromVpa('@ybl')).toBeNull();
    expect(mobileFromVpa('9876543210')).toBeNull();
  });
});

describe('FRI feed', () => {
  it('finds numbers after ingest and reports rejected rows', () => {
    const feed = friFeed('secret-key');
    const result = feed.ingest([
      { mobile: '9876543210', ...friEntry('very_high') },
      { mobile: 'garbage', ...friEntry('high') },
    ]);
    expect(result).toEqual({ loaded: 1, rejected: 1 });
    expect(feed.lookup('+91 9876543210')).toEqual({ listed: false, riskScore: 1 });
  });

  it('returns null for numbers absent from the snapshot', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ mobile: '9876543210', ...friEntry('high') }]);
    expect(feed.lookup('9123456789')).toBeNull();
  });

  it('replaces the previous snapshot on every ingest', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ mobile: '9876543210', ...friEntry('high') }]);
    feed.ingest([{ mobile: '9123456789', ...friEntry('high') }]);
    expect(feed.lookup('9876543210')).toBeNull();
    expect(feed.lookup('9123456789')).not.toBeNull();
  });
});

describe('feedReputationRule', () => {
  const rule = (entry: ReturnType<typeof friEntry> | { listed: true; riskScore: 1 }) => {
    const feed = friFeed('secret-key');
    feed.ingest([{ mobile: '9876543210', ...entry }]);
    return feedReputationRule([feed]);
  };

  it('blocks payees whose mobile number is hard-listed', () => {
    const hit = rule({ listed: true, riskScore: 1 }).evaluate(txn('9876543210@ybl'), {
      nowMs: 0,
    });
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('reviews payees at FRI High or Very High', () => {
    expect(
      rule(friEntry('high')).evaluate(txn('9876543210@ybl'), { nowMs: 0 })?.verdict,
    ).toBe(Verdict.Review);
    expect(
      rule(friEntry('very_high')).evaluate(txn('9876543210@ybl'), { nowMs: 0 })?.verdict,
    ).toBe(Verdict.Review);
  });

  it('lets FRI Medium through at the default threshold', () => {
    expect(
      rule(friEntry('medium')).evaluate(txn('9876543210@ybl'), { nowMs: 0 }),
    ).toBeNull();
  });

  it('skips payees that are not phone-number VPAs', () => {
    expect(
      rule(friEntry('very_high')).evaluate(txn('merchant@paytm'), { nowMs: 0 }),
    ).toBeNull();
  });

  it('allows clean payees', () => {
    expect(
      rule(friEntry('very_high')).evaluate(txn('9123456789@ybl'), { nowMs: 0 }),
    ).toBeNull();
  });
});
