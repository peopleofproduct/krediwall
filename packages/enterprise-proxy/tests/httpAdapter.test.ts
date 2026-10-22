import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Transaction } from '@vayu/core';
import { Verdict } from '@vayu/core';
import { velocitySpike } from '@vayu/telemetry-rules';
import { createHttpAdapter } from '../src/httpAdapter';
import { VayuAdapter } from '../src/vayuAdapter';

const TXN: Transaction = {
  txnId: 'txn-1',
  creditLineId: 'line-1',
  payerVpa: 'user@okhdfc',
  payeeVpa: 'merchant@paytm',
  amountPaise: 10_000_00,
  creditLimitPaise: 1_00_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
};

describe('httpAdapter', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createHttpAdapter(
      new VayuAdapter([velocitySpike({ maxDistinctMerchants: 1, windowMs: 60_000 })]),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('answers health checks', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('evaluates a transaction and returns the verdict', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(TXN),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict: string };
    expect(body.verdict).toBe(Verdict.Allow);

    const res2 = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TXN, txnId: 'txn-2', payeeVpa: 'other@ybl' }),
    });
    const body2 = (await res2.json()) as { verdict: string };
    expect(body2.verdict).toBe(Verdict.Block);
  });

  it('rejects malformed transactions with 400', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txnId: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    });
    expect(res.status).toBe(400);
  });

  it('404s unknown routes', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
