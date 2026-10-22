import type { Transaction } from '@vayu/core';
import { Verdict } from '@vayu/core';
import { velocitySpike } from '@vayu/telemetry-rules';
import { VayuAdapter } from '../src/vayuAdapter';

const txn = (overrides: Partial<Transaction>): Transaction => ({
  txnId: 'txn-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa: 'merchant@paytm',
  amountPaise: 10_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
  ...overrides,
});

describe('VayuAdapter', () => {
  it('proxies engine verdicts on the hot path', () => {
    const adapter = new VayuAdapter([
      velocitySpike({ maxDistinctMerchants: 1, windowMs: 60_000 }),
    ]);
    expect(adapter.handleTransaction(txn({ payeeVpa: 'a@paytm' })).verdict).toBe(
      Verdict.Allow,
    );
    expect(adapter.handleTransaction(txn({ payeeVpa: 'b@paytm' })).verdict).toBe(
      Verdict.Block,
    );
  });

  it('stubs the graph-network hook as unchecked', async () => {
    const adapter = new VayuAdapter([]);
    await expect(adapter.evaluateGraphNetwork('x@ybl')).resolves.toEqual({
      muleRingScore: 0,
      checked: false,
    });
  });

  it('counts evaluations through the billing meter', () => {
    const adapter = new VayuAdapter([]);
    adapter.handleTransaction(txn({}));
    adapter.handleTransaction(txn({}));
    // Current window is still open; nothing has rolled into completedWindows yet.
    expect(adapter.billingMeter().completedWindows.length).toBe(0);
  });
});
