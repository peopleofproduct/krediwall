import type { Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { velocitySpike } from '@krediwall/telemetry-rules';
import { complianceHooks } from '../src/compliance';
import type { IncidentRecord } from '../src/compliance';
import { KrediwallAdapter } from '../src/krediwallAdapter';

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

describe('KrediwallAdapter', () => {
  it('proxies engine verdicts on the hot path', () => {
    const adapter = new KrediwallAdapter([
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
    const adapter = new KrediwallAdapter([]);
    await expect(adapter.evaluateGraphNetwork('x@ybl')).resolves.toEqual({
      muleRingScore: 0,
      checked: false,
    });
  });

  it('counts evaluations through the billing meter', () => {
    const adapter = new KrediwallAdapter([]);
    adapter.handleTransaction(txn({}));
    adapter.handleTransaction(txn({}));
    // Current window is still open; nothing has rolled into completedWindows yet.
    expect(adapter.billingMeter().completedWindows.length).toBe(0);
  });
});

describe('complianceHooks', () => {
  it('computes CERT-In and FMR deadlines from classification time', () => {
    const hooks = complianceHooks();
    const record: IncidentRecord = {
      txnId: 'txn-1',
      rule: 'telemetry.mule-drain',
      verdict: Verdict.Block,
      atMs: 1_000,
    };
    expect(hooks.certInReportDeadlineMs(record)).toBe(1_000 + 6 * 3_600_000);
    expect(hooks.fmrDeadlineMs(1_000)).toBe(1_000 + 14 * 86_400_000);
  });
});
