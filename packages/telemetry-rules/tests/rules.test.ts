import type { Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from '../src/lruMap';
import { muleDrain } from '../src/muleDrain';
import { RingBuffer } from '../src/ringBuffer';
import { velocitySpike } from '../src/velocitySpike';

const T0 = 1_700_000_000_000;

const txn = (overrides: Partial<Transaction>): Transaction => ({
  txnId: 'txn-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa: 'merchant@paytm',
  amountPaise: 10_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: T0,
  terminalVerified: true,
  ...overrides,
});

describe('RingBuffer', () => {
  it('overwrites oldest entries once full', () => {
    const ring = new RingBuffer(3);
    ring.push(1, 10);
    ring.push(2, 20);
    ring.push(3, 30);
    ring.push(4, 40);
    expect(ring.length).toBe(3);
    const auxes: number[] = [];
    ring.forEachWithin(100, 4, (_ts, aux) => {
      auxes.push(aux);
    });
    expect(auxes).toEqual([40, 30, 20]); // newest to oldest, entry ts=1 evicted
  });

  it('stops walking at the first out-of-window entry', () => {
    const ring = new RingBuffer(8);
    ring.push(0, 1);
    ring.push(100, 2);
    const seen: number[] = [];
    ring.forEachWithin(50, 120, (ts) => {
      seen.push(ts);
    });
    expect(seen).toEqual([100]);
  });

  it('exposes a closure-free window iteration via countWithin/auxAt', () => {
    const ring = new RingBuffer(4);
    ring.push(0, 10);
    ring.push(100, 20);
    ring.push(110, 30);
    expect(ring.countWithin(50, 120)).toBe(2);
    expect([ring.auxAt(0), ring.auxAt(1)]).toEqual([30, 20]); // newest first
  });
});

describe('LruMap', () => {
  it('evicts the least-recently-used key once over capacity', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.get('a'); // a is now most recent, b is oldest
    map.set('c', 3);
    expect(map.size).toBe(2);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('a')).toBe(1);
    expect(map.get('c')).toBe(3);
  });
});

describe('velocitySpike', () => {
  const spike = () =>
    velocitySpike({ maxDistinctMerchants: 3, windowMs: 60_000 });

  it('allows spend spread across few distinct merchants', () => {
    const rule = spike();
    for (let i = 0; i < 3; i++) {
      const hit = rule.evaluate(
        txn({ payeeVpa: `m${i}@paytm`, timestampMs: T0 + i * 1_000 }),
        { nowMs: T0 + i * 1_000 },
      );
      expect(hit).toBeNull();
    }
  });

  it('blocks once distinct payee VPAs exceed the limit inside 60s', () => {
    const rule = spike();
    let last = null;
    for (let i = 0; i < 4; i++) {
      last = rule.evaluate(
        txn({ payeeVpa: `m${i}@paytm`, timestampMs: T0 + i * 1_000 }),
        { nowMs: T0 + i * 1_000 },
      );
    }
    expect(last?.verdict).toBe(Verdict.Block);
  });

  it('does not count repeats of the same VPA twice', () => {
    const rule = spike();
    for (let i = 0; i < 10; i++) {
      const hit = rule.evaluate(
        txn({ payeeVpa: 'same@paytm', timestampMs: T0 + i * 1_000 }),
        { nowMs: T0 + i * 1_000 },
      );
      expect(hit).toBeNull();
    }
  });

  it('blocks on geo mismatch even when distinct VPAs stay under limit', () => {
    const rule = velocitySpike({
      maxDistinctMerchants: 10,
      maxDistinctGeoCells: 2,
      windowMs: 60_000,
    });
    let last = null;
    const cells = ['blr', 'blr', 'mum', 'del']; // 3rd distinct cell fires
    for (let i = 0; i < cells.length; i++) {
      last = rule.evaluate(
        txn({ geoCell: cells[i], timestampMs: T0 + i * 1_000 }),
        { nowMs: T0 + i * 1_000 },
      );
    }
    expect(last?.verdict).toBe(Verdict.Block);
    expect(last?.reason).toContain('geo cells');
  });

  it('caps tracked credit lines and restarts history for evicted lines', () => {
    const rule = velocitySpike({
      maxDistinctMerchants: 1,
      windowMs: 60_000,
      maxTrackedLines: 1,
    });
    const at = (i: number) => ({ nowMs: T0 + i });
    rule.evaluate(txn({ creditLineId: 'line-1', payeeVpa: 'a@paytm' }), at(0));
    rule.evaluate(txn({ creditLineId: 'line-2', payeeVpa: 'x@paytm' }), at(1)); // evicts line-1
    // line-1 history was dropped, so a second distinct payee is not yet a spike.
    expect(
      rule.evaluate(txn({ creditLineId: 'line-1', payeeVpa: 'b@paytm' }), at(2)),
    ).toBeNull();
  });

  it('skips the geo check when transactions carry no geoCell', () => {
    const rule = velocitySpike({
      maxDistinctMerchants: 10,
      maxDistinctGeoCells: 1,
      windowMs: 60_000,
    });
    for (let i = 0; i < 5; i++) {
      expect(
        rule.evaluate(txn({ timestampMs: T0 + i }), { nowMs: T0 + i }),
      ).toBeNull();
    }
  });
});

describe('muleDrain', () => {
  // ₹49,999-ish repeat tickets against a ₹1,00,000 limit.
  const drain = () =>
    muleDrain({
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
    });

  it('blocks a two-ticket ~100% limit drain to unverified terminals', () => {
    const rule = drain();
    const unverified = { terminalVerified: false };
    expect(
      rule.evaluate(txn({ ...unverified, amountPaise: 49_999_00 }), { nowMs: T0 }),
    ).toBeNull();
    const hit = rule.evaluate(
      txn({ ...unverified, amountPaise: 49_999_00, timestampMs: T0 + 5_000 }),
      { nowMs: T0 + 5_000 },
    );
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('ignores identical drain patterns at verified terminals', () => {
    const rule = drain();
    for (let i = 0; i < 3; i++) {
      const hit = rule.evaluate(
        txn({ terminalVerified: true, amountPaise: 49_999_00, timestampMs: T0 + i }),
        { nowMs: T0 + i },
      );
      expect(hit).toBeNull();
    }
  });

  it('stays quiet when burn stays under the ratio', () => {
    // Same 2×₹49,999 pattern but against a ₹5L limit = 20% burn.
    const rule = muleDrain({
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
    });
    const unverified = { terminalVerified: false, creditLimitPaise: 5_00_000_00 };
    rule.evaluate(txn({ ...unverified, amountPaise: 49_999_00 }), { nowMs: T0 });
    const hit = rule.evaluate(
      txn({ ...unverified, amountPaise: 49_999_00, timestampMs: T0 + 1_000 }),
      { nowMs: T0 + 1_000 },
    );
    expect(hit).toBeNull();
  });

  it('catches a drain split across a window boundary (sliding, not tumbling)', () => {
    const rule = drain();
    const unverified = { terminalVerified: false, amountPaise: 49_999_00 };
    // Tickets 2s apart, straddling 60s after the first-ever transaction. A
    // tumbling window anchored at T0 would reset between them and miss it.
    rule.evaluate(txn({ ...unverified, amountPaise: 1_00 }), { nowMs: T0 });
    rule.evaluate(txn({ ...unverified }), { nowMs: T0 + 59_000 });
    const hit = rule.evaluate(txn({ ...unverified }), { nowMs: T0 + 61_000 });
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('forgets tickets older than the window', () => {
    const rule = drain();
    const unverified = { terminalVerified: false, amountPaise: 49_999_00 };
    rule.evaluate(txn({ ...unverified }), { nowMs: T0 });
    const hit = rule.evaluate(txn({ ...unverified }), { nowMs: T0 + 61_000 });
    expect(hit).toBeNull(); // first ticket is 61s old, outside the 60s window
  });

  it('blocks fresh lines but only reviews stale lines on the same pattern', () => {
    const opts = {
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
      freshLineMaxAgeMs: 86_400_000, // 24h
    };
    const unverified = { terminalVerified: false, amountPaise: 49_999_00 };

    const freshRule = muleDrain(opts);
    const approved1hAgo = T0 - 3_600_000;
    freshRule.evaluate(
      txn({ ...unverified, creditLineApprovedAtMs: approved1hAgo }),
      { nowMs: T0 },
    );
    const freshHit = freshRule.evaluate(
      txn({ ...unverified, creditLineApprovedAtMs: approved1hAgo, timestampMs: T0 + 1 }),
      { nowMs: T0 + 1 },
    );
    expect(freshHit?.verdict).toBe(Verdict.Block);

    const staleRule = muleDrain(opts);
    const approved10dAgo = T0 - 864_000_000;
    staleRule.evaluate(
      txn({ ...unverified, creditLineApprovedAtMs: approved10dAgo }),
      { nowMs: T0 },
    );
    const staleHit = staleRule.evaluate(
      txn({ ...unverified, creditLineApprovedAtMs: approved10dAgo, timestampMs: T0 + 1 }),
      { nowMs: T0 + 1 },
    );
    expect(staleHit?.verdict).toBe(Verdict.Review);
  });
});
