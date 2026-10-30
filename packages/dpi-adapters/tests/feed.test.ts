// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Verdict } from '@krediwall/core';
import type { Transaction } from '@krediwall/core';
import {
  feedReputationRule,
  friEntry,
  friFeed,
  mobileFromVpa,
  normalizeMobile,
} from '../src/feed';
import { loadFriSnapshotFile, parseFriSnapshot } from '../src/snapshotFile';

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

describe('FRI snapshot file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'krediwall-snap-'));
  const snapPath = join(dir, 'fri.json');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (doc: unknown) => writeFileSync(snapPath, JSON.stringify(doc));

  it('loads a well-formed snapshot with all three signal forms', () => {
    write({
      version: 1,
      generatedAtMs: 1_000,
      entries: [
        { mobile: '9876543210', level: 'very_high' },
        { mobile: '9123456789', listed: true },
        { mobile: '9988776655', riskScore: 0.8 },
      ],
    });
    const feed = friFeed('secret-key');
    const result = loadFriSnapshotFile(feed, snapPath, { nowMs: 2_000 });
    expect(result.loaded).toBe(3);
    expect(result.rejected).toBe(0);
    expect(result.generatedAtMs).toBe(1_000);
    expect(result.stale).toBe(false);
    expect(feed.lookup('9876543210')).toEqual({ listed: false, riskScore: 1 });
    expect(feed.lookup('9123456789')).toEqual({ listed: true, riskScore: 1 });
    expect(feed.lookup('9988776655')).toEqual({ listed: false, riskScore: 0.8 });
  });

  it('rejects malformed rows but loads the good ones', () => {
    write({
      entries: [
        { mobile: '9876543210', level: 'high' },
        { mobile: '9123456789', level: 'bogus' },
        { mobile: '9988776655' }, // no signal fields
        { riskScore: 0.9 }, // no mobile
        'not-an-object',
      ],
    });
    const feed = friFeed('secret-key');
    const result = loadFriSnapshotFile(feed, snapPath);
    expect(result.loaded).toBe(1);
    expect(result.rejected).toBe(4);
    expect(result.sampleErrors.length).toBeGreaterThan(0);
  });

  it('flags a stale snapshot when generatedAtMs is older than maxAgeMs', () => {
    write({ generatedAtMs: 1_000, entries: [{ mobile: '9876543210', level: 'high' }] });
    const feed = friFeed('secret-key');
    const result = loadFriSnapshotFile(feed, snapPath, {
      maxAgeMs: 500,
      nowMs: 2_000,
    });
    expect(result.stale).toBe(true);
    expect(result.loaded).toBe(1); // still loaded — caller decides policy
  });

  it('throws on a file that is not a snapshot object', () => {
    const feed = friFeed('secret-key');
    expect(() => parseFriSnapshot('{"entries": "nope"}')).toThrow('entries');
    expect(() => parseFriSnapshot('not json')).toThrow('not valid JSON');
    writeFileSync(snapPath, '42');
    expect(() => loadFriSnapshotFile(feed, snapPath)).toThrow('entries');
  });
});

describe('VPA-keyed rows and the resolver seam', () => {
  it('loads and matches vpa-keyed rows for account-level feeds', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ vpa: 'muleacct@ybl', listed: true, riskScore: 1 }]);
    expect(feed.lookupVpa('muleacct@ybl')).toEqual({ listed: true, riskScore: 1 });
    expect(feed.lookupVpa('MuleAcct@YBL')).not.toBeNull(); // normalised
    expect(feed.lookup('9876543210')).toBeNull(); // separate namespace
  });

  it('blocks a merchant VPA that appears in the feed directly', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ vpa: 'muleacct@ybl', listed: true, riskScore: 1 }]);
    const rule = feedReputationRule([feed]);
    const hit = rule.evaluate(txn('muleacct@ybl'), { nowMs: 0 });
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('resolves a non-phone VPA to a mobile via the integrator registry', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ mobile: '9876543210', listed: true, riskScore: 1 }]);
    const registry = new Map([['shop42@paytm', '9876543210']]);
    const rule = feedReputationRule([feed], 0.7, {
      resolveMobile: (vpa) => registry.get(vpa) ?? null,
    });
    expect(rule.evaluate(txn('shop42@paytm'), { nowMs: 0 })?.verdict).toBe(Verdict.Block);
    // Unknown VPAs still pass through unchecked
    expect(rule.evaluate(txn('unknown@paytm'), { nowMs: 0 })).toBeNull();
  });

  it('does not cross-match mobiles against the vpa namespace', () => {
    const feed = friFeed('secret-key');
    feed.ingest([{ vpa: '9876543210', listed: true, riskScore: 1 }]); // pathological row
    expect(feed.lookup('9876543210')).toBeNull();
    expect(feed.lookupVpa('9876543210')).toBeNull(); // no '@' → not a VPA
  });

  it('loads mixed mobile and vpa rows from a snapshot file', () => {
    const parsed = parseFriSnapshot(
      JSON.stringify({
        entries: [
          { mobile: '9876543210', level: 'high' },
          { vpa: 'muleacct@ybl', listed: true },
          { vpa: 'both@ybl', mobile: '9123456789', riskScore: 0.9 },
        ],
      }),
    );
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rejected).toBe(0);
  });
});
