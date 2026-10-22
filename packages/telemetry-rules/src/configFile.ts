import { readFileSync } from 'node:fs';
import type { Rule } from '@krediwall/core';
import type { MuleDrainOptions } from './muleDrain';
import { muleDrain } from './muleDrain';
import type { VelocitySpikeOptions } from './velocitySpike';
import { velocitySpike } from './velocitySpike';

/**
 * On-disk ruleset format (version 1) — thresholds ops can tune without a
 * code change. A block that is absent omits that rule entirely.
 *
 * ```jsonc
 * {
 *   "version": 1,
 *   "velocitySpike": {
 *     "maxDistinctMerchants": 4,   // required
 *     "maxDistinctGeoCells": 2,    // optional — geo leg off when absent
 *     "windowMs": 60000,           // required
 *     "capacity": 32,              // optional, default 32
 *     "maxTrackedLines": 100000    // optional, default 100000
 *   },
 *   "muleDrain": {
 *     "limitBurnRatio": 0.9,       // required
 *     "windowMs": 60000,           // required
 *     "ticketFloorPaise": 4500000, // required
 *     "ticketCeilPaise": 5000000,  // required
 *     "minRepeats": 2,             // required
 *     "freshLineMaxAgeMs": 86400000, "capacity": 32, "maxTrackedLines": 100000
 *   }
 * }
 * ```
 */
export interface TelemetryConfigFile {
  readonly version?: unknown;
  readonly velocitySpike?: unknown;
  readonly muleDrain?: unknown;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isPositiveInt = (v: unknown): v is number =>
  isFiniteNumber(v) && Number.isInteger(v) && v > 0;

function checkKeys(block: Record<string, unknown>, allowed: readonly string[], rule: string): void {
  for (const key of Object.keys(block)) {
    if (!allowed.includes(key)) {
      throw new Error(`${rule}: unknown field "${key}" — check for typos`);
    }
  }
}

function reqNum(block: Record<string, unknown>, field: string, rule: string): number {
  const v = block[field];
  if (!isFiniteNumber(v)) throw new Error(`${rule}: "${field}" must be a finite number`);
  return v;
}

function optPosInt(block: Record<string, unknown>, field: string, rule: string): number | undefined {
  const v = block[field];
  if (v === undefined) return undefined;
  if (!isPositiveInt(v)) throw new Error(`${rule}: "${field}" must be a positive integer`);
  return v;
}

const parseVelocitySpike = (raw: unknown): VelocitySpikeOptions => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('velocitySpike: block must be an object');
  }
  const b = raw as Record<string, unknown>;
  checkKeys(
    b,
    ['maxDistinctMerchants', 'maxDistinctGeoCells', 'windowMs', 'capacity', 'maxTrackedLines'],
    'velocitySpike',
  );
  const maxDistinctMerchants = b['maxDistinctMerchants'];
  const windowMs = b['windowMs'];
  if (!isPositiveInt(maxDistinctMerchants)) {
    throw new Error('velocitySpike: "maxDistinctMerchants" must be a positive integer');
  }
  if (!isPositiveInt(windowMs)) {
    throw new Error('velocitySpike: "windowMs" must be a positive integer');
  }
  const opts: { -readonly [K in keyof VelocitySpikeOptions]: VelocitySpikeOptions[K] } = {
    maxDistinctMerchants,
    windowMs,
  };
  const setOpt = (field: 'maxDistinctGeoCells' | 'capacity' | 'maxTrackedLines'): void => {
    const v = optPosInt(b, field, 'velocitySpike');
    if (v !== undefined) opts[field] = v;
  };
  setOpt('maxDistinctGeoCells');
  setOpt('capacity');
  setOpt('maxTrackedLines');
  return opts;
};

const parseMuleDrain = (raw: unknown): MuleDrainOptions => {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('muleDrain: block must be an object');
  }
  const b = raw as Record<string, unknown>;
  checkKeys(
    b,
    [
      'limitBurnRatio',
      'windowMs',
      'ticketFloorPaise',
      'ticketCeilPaise',
      'minRepeats',
      'freshLineMaxAgeMs',
      'capacity',
      'maxTrackedLines',
    ],
    'muleDrain',
  );
  const ratio = reqNum(b, 'limitBurnRatio', 'muleDrain');
  if (ratio <= 0 || ratio > 1) {
    throw new Error('muleDrain: "limitBurnRatio" must be in (0, 1]');
  }
  const windowMs = b['windowMs'];
  if (!isPositiveInt(windowMs)) throw new Error('muleDrain: "windowMs" must be a positive integer');
  const floor = reqNum(b, 'ticketFloorPaise', 'muleDrain');
  const ceil = reqNum(b, 'ticketCeilPaise', 'muleDrain');
  if (floor < 0 || ceil < floor) {
    throw new Error('muleDrain: ticket band is invalid (need 0 <= floor <= ceil)');
  }
  const minRepeats = b['minRepeats'];
  if (!isPositiveInt(minRepeats)) throw new Error('muleDrain: "minRepeats" must be a positive integer');
  const opts: { -readonly [K in keyof MuleDrainOptions]: MuleDrainOptions[K] } = {
    limitBurnRatio: ratio,
    windowMs,
    ticketFloorPaise: floor,
    ticketCeilPaise: ceil,
    minRepeats,
  };
  const setOpt = (field: 'freshLineMaxAgeMs' | 'capacity' | 'maxTrackedLines'): void => {
    const v = optPosInt(b, field, 'muleDrain');
    if (v !== undefined) opts[field] = v;
  };
  setOpt('freshLineMaxAgeMs');
  setOpt('capacity');
  setOpt('maxTrackedLines');
  return opts;
};

/**
 * Build rules from a parsed config object. Unknown field names throw —
 * a typo'd threshold must fail loudly, not silently keep a default.
 */
export function rulesFromConfig(config: unknown): Rule[] {
  if (typeof config !== 'object' || config === null) {
    throw new Error('rules config must be an object');
  }
  const doc = config as TelemetryConfigFile;
  if (doc.version !== undefined && doc.version !== 1) {
    throw new Error(`rules config: unsupported version ${JSON.stringify(doc.version)}`);
  }
  const rules: Rule[] = [];
  if (doc.velocitySpike !== undefined) rules.push(velocitySpike(parseVelocitySpike(doc.velocitySpike)));
  if (doc.muleDrain !== undefined) rules.push(muleDrain(parseMuleDrain(doc.muleDrain)));
  if (rules.length === 0) throw new Error('rules config enables no rules');
  return rules;
}

/** Load and validate a version-1 ruleset JSON file into live rules. */
export function loadRulesConfigFile(path: string): Rule[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`rules config ${path} is missing or not valid JSON`);
  }
  return rulesFromConfig(raw);
}
