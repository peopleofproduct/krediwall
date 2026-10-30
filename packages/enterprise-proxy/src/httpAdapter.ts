// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import type { IncomingMessage, Server } from 'node:http';
import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Transaction } from '@krediwall/core';
import type { KrediwallAdapter } from './krediwallAdapter';
import { renderPrometheus } from './metrics';

const MAX_BODY_BYTES = 16 * 1024;

export interface HttpAdapterOptions {
  /**
   * When set, `POST /v1/evaluate` and `GET /metrics` require
   * `Authorization: Bearer <apiKey>` (compared in constant time).
   * `/healthz` and `/readyz` stay open — orchestrators need them.
   * Unset means open; front the gateway with your own network controls
   * (mTLS, service mesh) as bank infrastructure usually does.
   */
  readonly apiKey?: string;
}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

/**
 * Constant-time bearer comparison: compare SHA-256 digests so the
 * response time never leaks how many leading characters matched.
 */
const bearerMatches = (header: string | undefined, apiKey: string): boolean => {
  if (header === undefined || !header.startsWith('Bearer ')) return false;
  const given = createHash('sha256').update(header.slice(7)).digest();
  const want = createHash('sha256').update(apiKey).digest();
  return timingSafeEqual(given, want);
};

interface FieldCheck {
  readonly field: keyof Transaction;
  readonly valid: (value: unknown) => boolean;
  readonly detail: string;
}

// Transport-level contract: the 8 required fields must be present with
// the right shape. Semantic oddities (a ₹0 payment, a nonsense geo cell)
// are *not* rejected here — they flow to the engine, whose malformed-input
// guard answers REVIEW so the audit trail records them.
const FIELD_CHECKS: readonly FieldCheck[] = [
  { field: 'txnId', valid: (v) => typeof v === 'string' && v.length > 0, detail: 'non-empty string' },
  { field: 'creditLineId', valid: (v) => typeof v === 'string' && v.length > 0, detail: 'non-empty string' },
  { field: 'payerVpa', valid: (v) => typeof v === 'string' && v.length > 0, detail: 'non-empty string' },
  { field: 'payeeVpa', valid: (v) => typeof v === 'string' && v.length > 0, detail: 'non-empty string' },
  {
    field: 'amountPaise',
    valid: (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
    detail: 'safe integer >= 0',
  },
  {
    field: 'creditLimitPaise',
    valid: (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
    detail: 'safe integer >= 0',
  },
  {
    field: 'timestampMs',
    valid: (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
    detail: 'safe integer >= 0',
  },
  { field: 'terminalVerified', valid: (v) => typeof v === 'boolean', detail: 'boolean' },
];

/**
 * Returns the first failing field, or null when the payload satisfies the
 * transport contract. Field names are echoed back so an integrator's
 * contract tests fail loudly at the exact missing key.
 */
const validateTransaction = (v: unknown): FieldCheck | null => {
  if (typeof v !== 'object' || v === null) return null; // handled as "not an object" upstream
  const t = v as Record<string, unknown>;
  for (const check of FIELD_CHECKS) {
    if (!(check.field in t)) return check;
    if (!check.valid(t[check.field])) return check;
  }
  return null;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Minimal framework-neutral HTTP front for the switch pipeline. Zero
 * external dependencies — just `node:http` over the adapter's synchronous
 * hot path. Every response carries an `x-request-id` header (echoed when
 * the caller sends one) so verdicts correlate with switch logs. The full
 * contract ships as `docs/api/openapi.yaml`.
 *
 *   POST /v1/evaluate  Transaction JSON → Evaluation JSON (200) or error (4xx)
 *   GET  /healthz      → {"status":"ok"} — process is up
 *   GET  /readyz       → 200 when the adapter's readinessProbe reports no
 *                        problems, 503 with the problem list otherwise
 *   GET  /metrics      → Prometheus text exposition of engine + rule counters
 */
export function createHttpAdapter(adapter: KrediwallAdapter, options?: HttpAdapterOptions): Server {
  const apiKey = options?.apiKey;
  return createServer((req, res) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    const send = (status: number, body: unknown, extraHeaders?: Record<string, string>): void => {
      const json = JSON.stringify(body);
      res.writeHead(status, {
        'content-type': 'application/json',
        'x-request-id': requestId,
        ...extraHeaders,
      });
      res.end(json);
    };
    const authorized = apiKey === undefined || bearerMatches(req.headers.authorization, apiKey);

    if (req.method === 'GET' && req.url === '/healthz') {
      send(200, { status: 'ok' });
      return;
    }

    if (req.method === 'GET' && req.url === '/readyz') {
      const problems = adapter.readinessProblems();
      if (problems.length === 0) {
        send(200, { ready: true });
      } else {
        send(503, { ready: false, problems });
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/metrics') {
      if (!authorized) {
        send(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
        return;
      }
      const text = renderPrometheus(adapter.metrics(), adapter.ruleStats());
      res.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        'x-request-id': requestId,
      });
      res.end(text);
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/evaluate') {
      if (!authorized) {
        send(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
        return;
      }
      void (async () => {
        try {
          const raw = await readBody(req);
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            send(400, { error: 'invalid request body', requestId, detail: 'not valid JSON' });
            return;
          }
          if (!isPlainObject(parsed)) {
            send(400, { error: 'invalid request body', requestId, detail: 'expected a JSON object' });
            return;
          }
          const bad = validateTransaction(parsed);
          if (bad !== null) {
            const present = bad.field in parsed;
            send(400, {
              error: 'malformed transaction',
              requestId,
              field: bad.field,
              detail: present
                ? `"${bad.field}" must be a ${bad.detail}`
                : `"${bad.field}" is missing (must be a ${bad.detail})`,
            });
            return;
          }
          // validateTransaction proved the eight required fields; optional
          // fields pass through untouched, hence the unknown-bridge cast.
          send(200, adapter.handleTransaction(parsed as unknown as Transaction));
        } catch {
          send(400, { error: 'invalid request body', requestId });
        }
      })();
      return;
    }

    send(404, { error: 'not found', requestId });
  });
}
