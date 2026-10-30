// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Transaction } from '@krediwall/core';
import { velocitySpike } from '@krediwall/telemetry-rules';
import { KrediwallAdapter } from '../src/krediwallAdapter';
import { readStateFile, writeStateFile } from '../src/stateFile';

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

describe('stateFile', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krediwall-state-'));
    file = join(dir, 'engine-state.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips an engine snapshot through a file', () => {
    const adapter = new KrediwallAdapter([
      velocitySpike({ maxDistinctMerchants: 4, windowMs: 60_000 }),
    ]);
    adapter.handleTransaction(TXN);
    adapter.saveStateToFile(file);

    const fresh = new KrediwallAdapter([
      velocitySpike({ maxDistinctMerchants: 4, windowMs: 60_000 }),
    ]);
    fresh.restoreStateFromFile(file);
    expect(fresh.ruleStats()['telemetry.velocity-spike']?.['trackedLines']).toBe(1);
  });

  it('writeStateFile produces a version-1 document readable by readStateFile', () => {
    const adapter = new KrediwallAdapter([]);
    writeStateFile(adapter.exportState(), file);
    const snapshot = readStateFile(file);
    expect(snapshot.version).toBe(1);
    expect(snapshot.rules).toEqual({});
    // no temp file is left behind
    expect(readFileSync(file, 'utf8')).toContain('"version":1');
  });

  it('readStateFile throws on a missing file', () => {
    expect(() => readStateFile(join(dir, 'nope.json'))).toThrow(/missing|JSON/);
  });

  it('readStateFile throws on a malformed file', () => {
    writeFileSync(file, JSON.stringify({ version: 99, rules: {} }));
    expect(() => readStateFile(file)).toThrow(/version-1/);
  });
});
