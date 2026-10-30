// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import type { Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { dormantReactivation } from '../src/dormant';
import { firstPayee } from '../src/firstPayee';
import { oddHours } from '../src/oddHours';
import { structuring } from '../src/structuring';

const T0 = 1_700_000_000_000; // 2023-11-14T22:13:20Z — 03:43 IST
const DAY = 86_400_000;
// A timestamp landing at 14:00 IST: 08:30 UTC
const IST_14H = 1_700_047_800_000;

const txn = (over: Partial<Transaction>): Transaction => ({
  txnId: 't-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa: 'merchant@paytm',
  amountPaise: 10_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: T0,
  terminalVerified: true,
  ...over,
});

describe('firstPayee', () => {
  const rule = () => firstPayee({ minAmountRatio: 0.5 });

  it('reviews a first-seen payee drawing half the limit', () => {
    const r = rule();
    const hit = r.evaluate(txn({ amountPaise: 60_000_00 }), { nowMs: IST_14H });
    expect(hit?.verdict).toBe(Verdict.Review);
    expect(hit?.evidence?.['firstSeenPayee']).toBe(1);
  });

  it('stays quiet on a first-seen payee with a small amount', () => {
    const r = rule();
    expect(
      r.evaluate(txn({ amountPaise: 5_000_00 }), { nowMs: IST_14H }),
    ).toBeNull();
  });

  it('stays quiet when the payee was seen before, however large', () => {
    const r = rule();
    r.evaluate(txn({ payeeVpa: 'known@ybl', amountPaise: 1_00 }), { nowMs: IST_14H });
    expect(
      r.evaluate(
        txn({ payeeVpa: 'known@ybl', amountPaise: 90_000_00, timestampMs: IST_14H + 1 }),
        { nowMs: IST_14H + 1 },
      ),
    ).toBeNull();
  });

  it('round-trips seen-payee state through export/restore', () => {
    const r1 = rule();
    r1.evaluate(txn({ payeeVpa: 'known@ybl', amountPaise: 1_00 }), { nowMs: IST_14H });
    const r2 = rule();
    r2.restoreState!(r1.exportState!());
    expect(
      r2.evaluate(
        txn({ payeeVpa: 'known@ybl', amountPaise: 90_000_00, timestampMs: IST_14H + 1 }),
        { nowMs: IST_14H + 1 },
      ),
    ).toBeNull();
  });
});

describe('dormantReactivation', () => {
  const rule = () => dormantReactivation({ dormantMs: 90 * DAY });

  it('reviews a line reactivating past the dormant window', () => {
    const r = rule();
    r.evaluate(txn({}), { nowMs: T0 });
    const hit = r.evaluate(txn({ timestampMs: T0 + 100 * DAY }), {
      nowMs: T0 + 100 * DAY,
    });
    expect(hit?.verdict).toBe(Verdict.Review);
    expect(hit?.evidence?.['idleDays']).toBe(100);
  });

  it('stays quiet inside the dormant window and on unseen lines', () => {
    const r = rule();
    expect(r.evaluate(txn({}), { nowMs: T0 })).toBeNull();
    expect(
      r.evaluate(txn({ timestampMs: T0 + 30 * DAY }), { nowMs: T0 + 30 * DAY }),
    ).toBeNull();
  });

  it('honours the minimum-amount filter', () => {
    const r = dormantReactivation({ dormantMs: DAY, minAmountPaise: 10_000_00 });
    r.evaluate(txn({}), { nowMs: T0 });
    expect(
      r.evaluate(txn({ amountPaise: 5_00, timestampMs: T0 + 2 * DAY }), {
        nowMs: T0 + 2 * DAY,
      }),
    ).toBeNull();
  });
});

describe('structuring', () => {
  const rule = () =>
    structuring({
      ticketFloorPaise: 90_000_00,
      ticketCeilPaise: 1_00_000_00,
      minRepeats: 3,
      windowMs: 60_000,
    });

  it('reviews three sub-threshold band tickets in the window', () => {
    const r = rule();
    expect(
      r.evaluate(txn({ amountPaise: 95_000_00 }), { nowMs: T0 }),
    ).toBeNull();
    expect(
      r.evaluate(txn({ amountPaise: 96_000_00, timestampMs: T0 + 10_000 }), {
        nowMs: T0 + 10_000,
      }),
    ).toBeNull();
    const hit = r.evaluate(
      txn({ amountPaise: 97_000_00, timestampMs: T0 + 20_000 }),
      { nowMs: T0 + 20_000 },
    );
    expect(hit?.verdict).toBe(Verdict.Review);
    expect(hit?.evidence?.['bandTickets']).toBe(3);
  });

  it('ignores tickets outside the band and outside the window', () => {
    const r = rule();
    r.evaluate(txn({ amountPaise: 95_000_00 }), { nowMs: T0 });
    r.evaluate(txn({ amountPaise: 95_000_00, timestampMs: T0 + 1 }), { nowMs: T0 + 1 });
    // Third ticket out of band, fourth in band but first two aged out.
    r.evaluate(txn({ amountPaise: 1_00, timestampMs: T0 + 61_000 }), {
      nowMs: T0 + 61_000,
    });
    expect(
      r.evaluate(txn({ amountPaise: 95_000_00, timestampMs: T0 + 62_000 }), {
        nowMs: T0 + 62_000,
      }),
    ).toBeNull();
  });
});

describe('oddHours', () => {
  const rule = () => oddHours({});

  it('reviews 03:43 IST activity on a line with no night history', () => {
    const r = rule();
    const hit = r.evaluate(txn({}), { nowMs: T0 }); // T0 = 03:43 IST
    expect(hit?.verdict).toBe(Verdict.Review);
    expect(hit?.evidence?.['istHour']).toBe(3);
  });

  it('stays quiet at daytime IST and on repeat odd-hours activity', () => {
    const r = rule();
    expect(r.evaluate(txn({ timestampMs: IST_14H }), { nowMs: IST_14H })).toBeNull();
    r.evaluate(txn({ timestampMs: T0 }), { nowMs: T0 }); // first 03:xx visit → sets bit
    expect(
      r.evaluate(txn({ timestampMs: T0 + 10_000 }), { nowMs: T0 + 10_000 }),
    ).toBeNull(); // same hour already in history
  });

  it('round-trips the hour bitmap through export/restore', () => {
    const r1 = rule();
    r1.evaluate(txn({ timestampMs: T0 }), { nowMs: T0 });
    const r2 = rule();
    r2.restoreState!(r1.exportState!());
    expect(
      r2.evaluate(txn({ timestampMs: T0 + 1_000 }), { nowMs: T0 + 1_000 }),
    ).toBeNull();
  });
});
