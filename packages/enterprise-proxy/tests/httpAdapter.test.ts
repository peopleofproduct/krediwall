// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

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

  it('echoes x-request-id when the caller sends one, generates one otherwise', async () => {
    const res = await fetch(`${base}/healthz`, {
      headers: { 'x-request-id': 'switch-abc-123' },
    });
    expect(res.headers.get('x-request-id')).toBe('switch-abc-123');
    const res2 = await fetch(`${base}/healthz`);
    const generated = res2.headers.get('x-request-id');
    expect(generated).toBeTruthy();
    expect(generated).not.toBe('switch-abc-123');
  });

  it('names the offending field on a malformed transaction', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...TXN, creditLineId: 12345 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string; detail: string };
    expect(body.error).toBe('malformed transaction');
    expect(body.field).toBe('creditLineId');
    expect(body.detail).toContain('non-empty string');
  });

  it('rejects non-integer and negative paise at the transport layer', async () => {
    for (const bad of [100.5, -1, '10000']) {
      const res = await fetch(`${base}/v1/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...TXN, amountPaise: bad }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { field: string };
      expect(body.field).toBe('amountPaise');
    }
  });

  it('reports a missing field distinctly from a mistyped one', async () => {
    const res = await fetch(`${base}/v1/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txnId: 't-1' }),
    });
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toContain('is missing');
  });

  it('requires bearer auth on evaluate and metrics when an API key is set', async () => {
    const authServer = createHttpAdapter(new KrediwallAdapter([]), { apiKey: 'secret-token' });
    await new Promise<void>((resolve) => authServer.listen(0, '127.0.0.1', resolve));
    const { port } = authServer.address() as AddressInfo;
    const authBase = `http://127.0.0.1:${port}`;
    try {
      const noAuth = await fetch(`${authBase}/v1/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(TXN),
      });
      expect(noAuth.status).toBe(401);
      expect(noAuth.headers.get('www-authenticate')).toBe('Bearer');

      const wrongAuth = await fetch(`${authBase}/v1/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
        body: JSON.stringify(TXN),
      });
      expect(wrongAuth.status).toBe(401);

      const good = await fetch(`${authBase}/v1/evaluate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify(TXN),
      });
      expect(good.status).toBe(200);

      const metricsBlocked = await fetch(`${authBase}/metrics`);
      expect(metricsBlocked.status).toBe(401);
      const metricsOk = await fetch(`${authBase}/metrics`, {
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(metricsOk.status).toBe(200);

      // Probes stay open for orchestrators.
      expect((await fetch(`${authBase}/healthz`)).status).toBe(200);
      expect((await fetch(`${authBase}/readyz`)).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) =>
        authServer.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
