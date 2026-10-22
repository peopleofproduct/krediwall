import type { Transaction } from '@vayu/core';
import { Verdict } from '@vayu/core';
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
});
