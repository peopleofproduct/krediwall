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

describe('state serialization', () => {
  it('round-trips a ring buffer oldest-first', () => {
    const ring = new RingBuffer(3);
    for (let i = 0; i < 5; i++) ring.push(i, i * 10);
    const clone = new RingBuffer(3);
    clone.loadEntries(ring.toEntries());
    expect(clone.toEntries()).toEqual(ring.toEntries());
    expect(clone.auxAt(0)).toBe(ring.auxAt(0));
  });

  it('preserves LRU recency order through serialization', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3);
    map.get('a'); // a most recent; b is LRU
    const clone = new LruMap<string, number>(3);
    for (const [k, v] of map.entriesLeastRecentFirst()) clone.set(k, v);
    clone.set('d', 4); // must evict b, same as the original would
    expect(clone.get('b')).toBeUndefined();
    expect(clone.get('a')).toBe(1);
    expect(clone.get('c')).toBe(3);
    expect(clone.get('d')).toBe(4);
  });

  it('preserves velocity-spike verdicts across export/restore', () => {
    const opts = { maxDistinctMerchants: 2, windowMs: 60_000 };
    const live = velocitySpike(opts);
    live.evaluate(txn({ payeeVpa: 'm1@paytm' }), { nowMs: T0 });
    live.evaluate(txn({ payeeVpa: 'm2@paytm', timestampMs: T0 + 1_000 }), {
      nowMs: T0 + 1_000,
    });

    const restored = velocitySpike(opts);
    restored.restoreState!(live.exportState!());
    // Third distinct payee pushes past the limit only because history survived.
    const hit = restored.evaluate(
      txn({ payeeVpa: 'm3@paytm', timestampMs: T0 + 2_000 }),
      { nowMs: T0 + 2_000 },
    );
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('preserves mule-drain state across export/restore', () => {
    const opts = {
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
    };
    const unverified = { terminalVerified: false, amountPaise: 49_999_00 };
    const live = muleDrain(opts);
    live.evaluate(txn({ ...unverified }), { nowMs: T0 });

    const restored = muleDrain(opts);
    restored.restoreState!(live.exportState!());
    const hit = restored.evaluate(
      txn({ ...unverified, timestampMs: T0 + 5_000 }),
      { nowMs: T0 + 5_000 },
    );
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('rejects a malformed snapshot', () => {
    const rule = muleDrain({
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
    });
    expect(() => rule.restoreState!({ not: 'an array' })).toThrow('bad snapshot');
  });
});

describe('adversarial streams', () => {
  it('tolerates out-of-order timestamps without corrupting state', () => {
    const ring = new RingBuffer(8);
    ring.push(1_000, 1);
    ring.push(500, 2); // earlier timestamp inserted after a newer one
    ring.push(1_200, 3);
    // Window walk may under-count (a stale entry hides what sits behind it),
    // but must never read out of bounds or misbehave.
    const n = ring.countWithin(10_000, 1_200);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(3);
    expect(ring.length).toBe(3);
  });

  it('survives a 10k-transaction fuzz stream with jittered clocks', () => {
    const velocity = velocitySpike({
      maxDistinctMerchants: 4,
      maxDistinctGeoCells: 3,
      windowMs: 60_000,
    });
    const drain = muleDrain({
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
      maxTrackedLines: 100,
    });
    let seed = 0x12345678;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const verdicts = new Set<Verdict>();
    let now = T0;
    for (let i = 0; i < 10_000; i++) {
      // Mostly increasing clock with occasional backward jitter, as in a
      // replicated or multi-switch feed.
      now += ((rand() * 3) | 0) - (rand() < 0.05 ? 5_000 : 0);
      const t = txn({
        txnId: `fz-${i}`,
        creditLineId: `line-${(rand() * 200) | 0}`,
        payeeVpa: `p${(rand() * 500) | 0}@ybl`,
        amountPaise: ((rand() * 60_000) | 0) * 100,
        timestampMs: now,
        terminalVerified: rand() < 0.9,
        geoCell: ['blr', 'mum', 'del'][(rand() * 3) | 0],
        creditLineApprovedAtMs: now - ((rand() * 86_400_000) | 0),
      });
      expect(() => velocity.evaluate(t, { nowMs: now })).not.toThrow();
      const hit = drain.evaluate(t, { nowMs: now });
      if (hit !== null) verdicts.add(hit.verdict);
    }
    for (const v of verdicts) {
      expect([Verdict.Block, Verdict.Review]).toContain(v);
    }
  });
});

describe('observability stats', () => {
  it('counts LRU evictions', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3); // evicts 'a'
    map.set('d', 4); // evicts 'b'
    expect(map.evictedCount).toBe(2);
    expect(map.size).toBe(2);
  });

  it('exposes tracked/evicted lines through rule stats()', () => {
    const rule = velocitySpike({
      maxDistinctMerchants: 10,
      windowMs: 60_000,
      maxTrackedLines: 2,
    });
    rule.evaluate(txn({ creditLineId: 'l1' }), { nowMs: T0 });
    rule.evaluate(txn({ creditLineId: 'l2' }), { nowMs: T0 });
    rule.evaluate(txn({ creditLineId: 'l3' }), { nowMs: T0 }); // evicts l1
    expect(rule.stats?.()).toEqual({
      trackedLines: 2,
      maxTrackedLines: 2,
      evictedLines: 1,
    });
  });
});
