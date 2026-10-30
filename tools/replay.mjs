// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

// Labelled-stream replay — how a bank evaluates (and calibrates) Krediwall.
//
//   npm run replay -- --input=stream.jsonl [--rules=rules.json]
//
// Each input line is one JSON object:
//   {"txn": {…Transaction fields…}, "expect": "ALLOW"|"REVIEW"|"BLOCK"}
// `expect` is optional; unlabelled rows still count toward the verdict mix.
//
// The report shows per-verdict counts, per-rule hit counts, a confusion
// matrix (expected × produced) when labels are present, the false-positive
// and catch rates a risk team quotes, and evaluation latency percentiles.
// Calibration loop: edit the ruleset JSON → rerun → compare.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { KrediwallAdapter } = require('@krediwall/enterprise-proxy');
const { creditOnUpiRules, loadRulesConfigFile } = require('@krediwall/telemetry-rules');

const flag = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
};
const input = flag('input');
if (input === undefined) {
  console.error('usage: --input=stream.jsonl [--rules=rules.json]');
  process.exit(1);
}
const rules = flag('rules') ? loadRulesConfigFile(flag('rules')) : creditOnUpiRules();
const adapter = new KrediwallAdapter(rules);

const lines = readFileSync(input, 'utf8').split('\n').filter((l) => l.trim() !== '');
const latencies = [];
const verdictCounts = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
const ruleHits = {};
// confusion[expected][produced] — expected 'unlabelled' rows tracked too.
const confusion = {};
const VERDICTS = ['ALLOW', 'REVIEW', 'BLOCK'];

let total = 0;
let malformed = 0;
for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    malformed += 1;
    continue;
  }
  const txn = row.txn ?? row; // bare transactions tolerated
  const expect = VERDICTS.includes(row.expect) ? row.expect : 'unlabelled';
  const evaluation = adapter.handleTransaction(txn);
  total += 1;
  verdictCounts[evaluation.verdict] += 1;
  latencies.push(evaluation.elapsedMicros);
  for (const hit of evaluation.hits) {
    ruleHits[hit.rule] = (ruleHits[hit.rule] ?? 0) + 1;
  }
  confusion[expect] ??= { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
  confusion[expect][evaluation.verdict] += 1;
}

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;

const labelled = Object.keys(confusion).filter((k) => k !== 'unlabelled');
const flagged = (v) => v !== 'ALLOW';
let labelledTotal = 0;
let catches = 0;
let falsePositives = 0;
for (const exp of labelled) {
  for (const got of VERDICTS) {
    const n = confusion[exp][got];
    labelledTotal += n;
    if (flagged(exp) && flagged(got) && (exp === 'BLOCK' ? got === 'BLOCK' : true)) catches += n;
    if (exp === 'ALLOW' && got === 'BLOCK') falsePositives += n;
  }
}
// Denominator: rows *expected* flagged, i.e. row sums for REVIEW/BLOCK expectations.
const expectedFlagged = labelled
  .filter((e) => flagged(e))
  .reduce((a, e) => a + confusion[e].ALLOW + confusion[e].REVIEW + confusion[e].BLOCK, 0);

console.log(`replay: ${total} evaluated${malformed > 0 ? `, ${malformed} unparseable lines skipped` : ''}`);
console.log(`rules: ${rules.map((r) => r.name).join(', ')}`);
console.log(`\nverdicts   ALLOW ${verdictCounts.ALLOW} · REVIEW ${verdictCounts.REVIEW} · BLOCK ${verdictCounts.BLOCK}`);
console.log('rule hits');
for (const [rule, n] of Object.entries(ruleHits).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.toString().padStart(8)}  ${rule}`);
}
if (labelled.length > 0) {
  console.log('\nconfusion (rows = expected, cols = produced)');
  console.log(`            ${VERDICTS.map((v) => v.padStart(7)).join('')}`);
  for (const exp of [...labelled, 'unlabelled']) {
    const row = confusion[exp];
    if (row === undefined) continue;
    console.log(`  ${exp.padEnd(9)} ${VERDICTS.map((v) => String(row[v]).padStart(7)).join('')}`);
  }
  const catchRate = expectedFlagged > 0 ? ((catches / expectedFlagged) * 100).toFixed(1) : 'n/a';
  const allowSeen = confusion['ALLOW']
    ? confusion['ALLOW'].ALLOW + confusion['ALLOW'].REVIEW + confusion['ALLOW'].BLOCK
    : 0;
  const fpRate = allowSeen > 0 ? ((falsePositives / allowSeen) * 100).toFixed(2) : 'n/a';
  console.log(`\ncatch rate      ${catchRate}%  (flagged expectations met)`);
  console.log(`false positives ${fpRate}%  (ALLOW-labelled txns blocked)`);
}
console.log(`\nlatency    p50 ${pct(0.5).toFixed(1)}µs · p99 ${pct(0.99).toFixed(1)}µs · max ${(latencies.at(-1) ?? 0).toFixed(1)}µs`);
