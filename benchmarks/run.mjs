// Run with: npm run bench   (builds first)
//
// Measures per-call latency of FirewallEngine.evaluate() with the starter rule
// set over many credit lines. The harness reuses one mutable transaction
// object so it does not allocate on its own: any GC pauses in the tail are the
// engine's and rules' doing. Single-threaded, sequential — this is a latency
// measurement of the in-process check, not a throughput or network benchmark.
//
// Flags: --txns=N  --lines=N  --warmup=N  --budget-us=N (exit 1 if p99 exceeds)
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const { FirewallEngine } = require('@krediwall/core');
const { creditOnUpiRules } = require('@krediwall/telemetry-rules');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const TXNS = arg('txns', 2_000_000);
const LINES = arg('lines', 100_000);
const WARMUP = arg('warmup', 200_000);
const BUDGET_US = arg('budget-us', 5_000);

// Deterministic PRNG so runs are comparable.
let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const payees = Array.from({ length: 5_000 }, (_, i) => `merchant${i}@ybl`);
const lines = Array.from({ length: LINES }, (_, i) => `line-${i}`);
const cells = ['blr', 'mum', 'del', 'hyd', 'maa', 'ccu'];

const txn = {
  txnId: 'bench',
  creditLineId: '',
  payerVpa: 'borrower@okbank',
  payeeVpa: '',
  amountPaise: 0,
  creditLimitPaise: 60_000_00,
  timestampMs: 1_700_000_000_000,
  terminalVerified: true,
  geoCell: 'blr',
  creditLineApprovedAtMs: 1_699_000_000_000,
};

const engine = new FirewallEngine(creditOnUpiRules());
const next = () => {
  txn.creditLineId = lines[(rand() * LINES) | 0];
  txn.payeeVpa = payees[(rand() * payees.length) | 0];
  txn.amountPaise = 50_00 + ((rand() * 2_000_00) | 0);
  txn.terminalVerified = rand() < 0.97;
  txn.geoCell = cells[(rand() * 2) | 0]; // mostly home-city traffic
  txn.timestampMs += 1 + ((rand() * 3) | 0);
};

// Warm up: touch every credit line once (so per-line state exists and the
// measured phase is steady state), then run random traffic to settle the JIT.
for (let i = 0; i < LINES; i++) {
  next();
  txn.creditLineId = lines[i];
  engine.evaluate(txn);
}
for (let i = 0; i < WARMUP; i++) {
  next();
  engine.evaluate(txn);
}
if (globalThis.gc) globalThis.gc();
const memBefore = process.memoryUsage();

const samples = new Float64Array(TXNS);
const verdicts = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
const wallStart = performance.now();
for (let i = 0; i < TXNS; i++) {
  next();
  const t0 = performance.now();
  const result = engine.evaluate(txn);
  samples[i] = (performance.now() - t0) * 1000;
  verdicts[result.verdict] += 1;
}
const wallMs = performance.now() - wallStart;
const memAfter = process.memoryUsage();

samples.sort();
const pct = (p) => samples[Math.min(TXNS - 1, Math.floor((p / 100) * TXNS))];
const fmt = (us) => `${us.toFixed(2)} µs`;

console.log(`Node ${process.version} · ${process.platform}/${process.arch}`);
console.log(`${TXNS.toLocaleString()} evaluations over ${LINES.toLocaleString()} credit lines (warmup ${WARMUP.toLocaleString()})`);
console.log(`verdicts: ${JSON.stringify(verdicts)}`);
console.log(`latency  p50 ${fmt(pct(50))} · p90 ${fmt(pct(90))} · p99 ${fmt(pct(99))} · p99.9 ${fmt(pct(99.9))} · max ${fmt(samples[TXNS - 1])}`);
let over1ms = 0;
let overBudget = 0;
for (let i = TXNS - 1; i >= 0 && samples[i] > 1_000; i--) {
  over1ms += 1;
  if (samples[i] > BUDGET_US) overBudget += 1;
}
console.log(`tail     ${over1ms} evaluations > 1 ms · ${overBudget} > ${BUDGET_US} µs budget (of ${TXNS.toLocaleString()})`);
console.log(`throughput ≈ ${Math.round(TXNS / (wallMs / 1000)).toLocaleString()} evaluations/s single-threaded (includes harness work)`);
const mb = (bytes) => (bytes / 1048576).toFixed(0);
console.log(
  `memory   ring-buffer state ≈ ${(memAfter.arrayBuffers / LINES / 1024).toFixed(1)} KB per tracked line` +
    ` (${mb(memAfter.arrayBuffers)} MB array buffers for ${LINES.toLocaleString()} lines) · JS heap ${mb(memBefore.heapUsed)} → ${mb(memAfter.heapUsed)} MB` +
    (globalThis.gc ? '' : ' (run with node --expose-gc for a cleaner baseline)'),
);
console.log('note     tail latency is sensitive to machine load and V8 GC pauses; run on quiet, dedicated hardware.');

if (pct(99) > BUDGET_US) {
  console.error(`FAIL: p99 ${fmt(pct(99))} exceeds budget ${BUDGET_US} µs`);
  process.exit(1);
}
console.log(`OK: p99 within ${BUDGET_US} µs budget`);
