import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { velocitySpike } from '@krediwall/telemetry-rules';
import { createHttpAdapter } from '../src/httpAdapter';
import { KrediwallAdapter } from '../src/krediwallAdapter';

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
      new KrediwallAdapter([velocitySpike({ maxDistinctMerchants: 1, windowMs: 60_000 })]),
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

  it('answers readiness checks — 200 clean, 503 with problems', async () => {
    let problems: string[] = [];
    const probeServer = createHttpAdapter(
      new KrediwallAdapter([], { readinessProbe: () => problems }),
    );
    await new Promise<void>((resolve) => probeServer.listen(0, '127.0.0.1', resolve));
    const { port } = probeServer.address() as AddressInfo;
    try {
      const ok = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(ok.status).toBe(200);
      problems = ['fri snapshot stale'];
      const bad = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(bad.status).toBe(503);
      expect(await bad.json()).toEqual({ ready: false, problems: ['fri snapshot stale'] });
    } finally {
      await new Promise<void>((resolve, reject) =>
        probeServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it('serves Prometheus metrics', async () => {
    const res = await fetch(`${base}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('krediwall_evaluations_total');
    expect(text).toContain('krediwall_verdict_total{verdict="ALLOW"}');
    expect(text).toContain('krediwall_rule_hit_total{rule="telemetry.velocity-spike"}');
    expect(text).toContain('krediwall_rule_stat_trackedLines{rule="telemetry.velocity-spike"}');
  });

  it('404s unknown routes', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
