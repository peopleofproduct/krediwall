import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRulesConfigFile, rulesFromConfig } from '../src/configFile';
import type { Transaction } from '@krediwall/core';
import { Verdict } from '@krediwall/core';

const T0 = 1_700_000_000_000;
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

const FULL_CONFIG = {
  version: 1,
  velocitySpike: { maxDistinctMerchants: 2, windowMs: 60_000 },
  muleDrain: {
    limitBurnRatio: 0.9,
    windowMs: 60_000,
    ticketFloorPaise: 45_000_00,
    ticketCeilPaise: 50_000_00,
    minRepeats: 2,
  },
};

describe('rulesFromConfig', () => {
  it('builds working rules from a full config', () => {
    const rules = rulesFromConfig(FULL_CONFIG);
    expect(rules.map((r) => r.name)).toEqual([
      'telemetry.velocity-spike',
      'telemetry.mule-drain',
    ]);
    // Configured velocity limit of 2 is honoured.
    const velocity = rules[0]!;
    velocity.evaluate(txn({ payeeVpa: 'a@ybl' }), { nowMs: T0 });
    velocity.evaluate(txn({ payeeVpa: 'b@ybl', timestampMs: T0 + 1 }), { nowMs: T0 + 1 });
    const hit = velocity.evaluate(txn({ payeeVpa: 'c@ybl', timestampMs: T0 + 2 }), {
      nowMs: T0 + 2,
    });
    expect(hit?.verdict).toBe(Verdict.Block);
  });

  it('omits rules whose block is absent', () => {
    const rules = rulesFromConfig({ version: 1, velocitySpike: { maxDistinctMerchants: 4, windowMs: 60_000 } });
    expect(rules.map((r) => r.name)).toEqual(['telemetry.velocity-spike']);
  });

  it('rejects an empty ruleset', () => {
    expect(() => rulesFromConfig({ version: 1 })).toThrow('no rules');
  });

  it('rejects unknown fields — a typo must fail loudly', () => {
    expect(() =>
      rulesFromConfig({
        velocitySpike: { maxDistinctMerchants: 4, windowSecs: 60 },
      }),
    ).toThrow('unknown field "windowSecs"');
  });

  it('rejects a bad burn ratio and inverted ticket band', () => {
    const badRatio = { ...FULL_CONFIG, muleDrain: { ...FULL_CONFIG.muleDrain, limitBurnRatio: 1.5 } };
    expect(() => rulesFromConfig(badRatio)).toThrow('limitBurnRatio');
    const badBand = {
      ...FULL_CONFIG,
      muleDrain: { ...FULL_CONFIG.muleDrain, ticketFloorPaise: 60_000_00 },
    };
    expect(() => rulesFromConfig(badBand)).toThrow('ticket band');
  });

  it('rejects a non-object config and a bad version', () => {
    expect(() => rulesFromConfig('x')).toThrow('must be an object');
    expect(() => rulesFromConfig({ ...FULL_CONFIG, version: 2 })).toThrow('version');
  });

  it('builds the second-generation rules', () => {
    const rules = rulesFromConfig({
      version: 1,
      firstPayee: { minAmountRatio: 0.6 },
      dormantReactivation: { dormantMs: 90 * 86_400_000, verdict: 'BLOCK' },
      structuring: {
        ticketFloorPaise: 80_000_00,
        ticketCeilPaise: 90_000_00,
        windowMs: 60_000,
      },
      oddHours: { oddHoursIst: [0, 6] },
    });
    expect(rules.map((r) => r.name)).toEqual([
      'telemetry.first-payee',
      'telemetry.dormant-reactivation',
      'telemetry.structuring',
      'telemetry.odd-hours',
    ]);
  });

  it('rejects a bad verdict string and a malformed hour band', () => {
    expect(() =>
      rulesFromConfig({ firstPayee: { verdict: 'WARN' } }),
    ).toThrow('"verdict"');
    expect(() =>
      rulesFromConfig({ oddHours: { oddHoursIst: [0, 25] } }),
    ).toThrow('oddHoursIst');
    expect(() =>
      rulesFromConfig({ structuring: { ticketFloorPaise: 100 } }),
    ).toThrow('ticketCeilPaise');
  });
});

describe('loadRulesConfigFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'krediwall-rules-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads a ruleset from disk', () => {
    const file = join(dir, 'rules.json');
    writeFileSync(file, JSON.stringify(FULL_CONFIG));
    const rules = loadRulesConfigFile(file);
    expect(rules).toHaveLength(2);
  });

  it('throws on a missing or non-JSON file', () => {
    expect(() => loadRulesConfigFile(join(dir, 'nope.json'))).toThrow(/missing|JSON/);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{nope');
    expect(() => loadRulesConfigFile(bad)).toThrow(/JSON/);
  });
});
