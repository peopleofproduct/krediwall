// Run with: npm run soak   (builds first)
//
// Sustained-load check that rule state stays bounded over time: runs
// evaluations for --duration-s seconds against more credit lines than the
// tracking cap, so the LRU eviction path is exercised continuously.
// Samples heap and rule counters every --sample-s seconds and reports the
// drift — heap that climbs without settling is a leak signal.
//
// Flags: --duration-s=60  --sample-s=5  --lines=200000
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { FirewallEngine } = require('@krediwall/core');
const { creditOnUpiRules } = require('@krediwall/telemetry-rules');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const DURATION_S = arg('duration-s', 60);
const SAMPLE_S = arg('sample-s', 5);
const LINES = arg('lines', 200_000); // > default 100k cap → evictions exercised

let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const payees = Array.from({ length: 5_000 }, (_, i) => `merchant${i}@ybl`);
const cells = ['blr', 'mum', 'del', 'hyd'];
const txn = {
  txnId: 'soak',
  creditLineId: '',
  payerVpa: 'borrower@okbank',
  payeeVpa: '',
  amountPaise: 0,
  creditLimitPaise: 60_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
  geoCell: 'blr',
};

const engine = new FirewallEngine(creditOnUpiRules());
const mb = (bytes) => (bytes / 1_048_576).toFixed(0);
const heap = () => process.memoryUsage().heapUsed;

console.log(`soak: ${DURATION_S}s, ${LINES.toLocaleString()} lines (cap 100,000), sampling every ${SAMPLE_S}s`);
console.log('elapsed_s | evaluations | heap_MB | tracked_lines | evicted_lines');

const endAt = Date.now() + DURATION_S * 1000;
let nextSample = Date.now();
const t0 = heap();
let evals = 0;

while (Date.now() < endAt) {
  txn.creditLineId = `line-${(rand() * LINES) | 0}`;
  txn.payeeVpa = payees[(rand() * payees.length) | 0];
  txn.amountPaise = 50_00 + ((rand() * 2_000_00) | 0);
  txn.terminalVerified = rand() < 0.97;
  txn.geoCell = cells[(rand() * cells.length) | 0];
  txn.timestampMs += 1 + ((rand() * 3) | 0);
  engine.evaluate(txn);
  evals += 1;

  if (Date.now() >= nextSample) {
    const stats = Object.values(engine.ruleStats());
    const tracked = stats.reduce((a, s) => a + (s.trackedLines ?? 0), 0);
    const evicted = stats.reduce((a, s) => a + (s.evictedLines ?? 0), 0);
    console.log(
      `${((DURATION_S * 1000 - (endAt - Date.now())) / 1000).toFixed(0).padStart(9)} | ` +
        `${evals.toLocaleString().padStart(11)} | ${mb(heap()).padStart(7)} | ` +
        `${tracked.toLocaleString().padStart(13)} | ${evicted.toLocaleString().padStart(13)}`,
    );
    nextSample = Date.now() + SAMPLE_S * 1000;
  }
}

const growth = mb(heap() - t0);
console.log(`\ndone: ${evals.toLocaleString()} evaluations, heap growth ${growth} MB since start`);
console.log(
  'note: heap is expected to settle — unbounded growth across samples is the failure signal. ' +
    'evicted_lines > 0 is expected here (LINES exceeds the cap).',
);
