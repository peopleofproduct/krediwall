import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { Transaction } from '@krediwall/core';
import type { KrediwallAdapter } from './krediwallAdapter';

const MAX_BODY_BYTES = 16 * 1024;

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

const send = (res: ServerResponse, status: number, body: unknown): void => {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(json);
};

const REQUIRED_FIELDS: ReadonlyArray<keyof Transaction> = [
  'txnId',
  'creditLineId',
  'payerVpa',
  'payeeVpa',
  'amountPaise',
  'creditLimitPaise',
  'timestampMs',
  'terminalVerified',
];

const isTransaction = (v: unknown): v is Transaction => {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (!(f in t)) return false;
  }
  return (
    typeof t['txnId'] === 'string' &&
    typeof t['amountPaise'] === 'number' &&
    typeof t['creditLimitPaise'] === 'number' &&
    typeof t['timestampMs'] === 'number' &&
    typeof t['terminalVerified'] === 'boolean'
  );
};

/**
 * Minimal framework-neutral HTTP front for the switch pipeline. Zero
 * external dependencies — just `node:http` over the adapter's synchronous
 * hot path.
 *
 *   POST /v1/evaluate  Transaction JSON → Evaluation JSON (200) or error (4xx)
 *   GET  /healthz      → {"status":"ok"}
 */
export function createHttpAdapter(adapter: KrediwallAdapter): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      send(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/evaluate') {
      void (async () => {
        try {
          const raw = await readBody(req);
          const parsed: unknown = JSON.parse(raw);
          if (!isTransaction(parsed)) {
            send(res, 400, { error: 'malformed transaction' });
            return;
          }
          send(res, 200, adapter.handleTransaction(parsed));
        } catch {
          send(res, 400, { error: 'invalid request body' });
        }
      })();
      return;
    }

    send(res, 404, { error: 'not found' });
  });
}
