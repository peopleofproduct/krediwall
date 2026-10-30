#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

// Review summary over a decision log produced by the reference gateway
// (KREDIWALL_DECISION_LOG): per-rule firings, verdict mix, latency, the
// degraded/error rows an analyst must look at first, and the top BLOCKed
// payees by count. Text output today; the same file feeds your case queue.
//
//   node tools/decisions-report.mjs --input=decisions.jsonl [--top=10]
//
// The decision log contains raw identifiers — this tool reports payee
// VPA slices only by default; keep both files inside your perimeter.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit !== undefined ? hit.slice(name.length + 3) : fallback;
};
const input = arg('input', 'decisions.jsonl');
const top = Number(arg('top', 10));

const lines = readFileSync(input, 'utf8').split('\n');
let total = 0;
let skipped = 0;
let degradedCount = 0;
let errorRows = 0;
let dedupHint = 0;
const verdicts = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
const byRule = Object.create(null);
const blockedPayees = Object.create(null);
const reviewPayees = Object.create(null);
const latencies = [];
const firstSeen = Object.create(null);
const lastSeen = Object.create(null);
let firstAt = null;
let lastAt = null;

for (const line of lines) {
  if (line.trim() === '') continue;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    skipped += 1;
    continue;
  }
  if (typeof rec.txnId !== 'string' || typeof rec.verdict !== 'string') {
    skipped += 1;
    continue;
  }
  total += 1;
  if (rec.verdict in verdicts) verdicts[rec.verdict] += 1;
  if (rec.degraded === true) degradedCount += 1;
  if (Array.isArray(rec.ruleErrors) && rec.ruleErrors.length > 0) errorRows += 1;
  // Same txnId twice with different wall-clock rows: the engine answered
  // the retry from the dedupe cache only if it appears at all — a repeat
  // row here means the retry arrived outside the dedupe window.
  if (rec.txnId in firstSeen) dedupHint += 1;
  else firstSeen[rec.txnId] = total;
  lastSeen[rec.txnId] = total;
  if (typeof rec.elapsedMicros === 'number') latencies.push(rec.elapsedMicros);
  if (typeof rec.atMs === 'number') {
    if (firstAt === null || rec.atMs < firstAt) firstAt = rec.atMs;
    if (lastAt === null || rec.atMs > lastAt) lastAt = rec.atMs;
  }
  if (typeof rec.payeeVpa === 'string') {
    if (rec.verdict === 'BLOCK') blockedPayees[rec.payeeVpa] = (blockedPayees[rec.payeeVpa] ?? 0) + 1;
    if (rec.verdict === 'REVIEW') reviewPayees[rec.payeeVpa] = (reviewPayees[rec.payeeVpa] ?? 0) + 1;
  }
  if (Array.isArray(rec.hits)) {
    for (const hit of rec.hits) {
      if (typeof hit?.rule === 'string') byRule[hit.rule] = (byRule[hit.rule] ?? 0) + 1;
    }
  }
}

latencies.sort((a, b) => a - b);
const pct = (p) =>
  latencies.length === 0 ? 0 : latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))];

const bar = (n, max) => '█'.repeat(max > 0 ? Math.max(n > 0 ? 1 : 0, Math.round((n / max) * 24)) : 0);
const topEntries = (obj, count) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);

console.log(`decisions: ${total} rows${skipped > 0 ? `, ${skipped} unparseable skipped` : ''}`);
if (firstAt !== null && lastAt !== null && lastAt > firstAt) {
  console.log(
    `window: ${new Date(firstAt).toISOString()} → ${new Date(lastAt).toISOString()} ` +
      `(${Math.max(1, Math.round((lastAt - firstAt) / 1000))}s)`,
  );
}
const maxVerdict = Math.max(...Object.values(verdicts));
console.log('\nverdict mix');
for (const [v, n] of Object.entries(verdicts)) {
  console.log(`  ${v.padEnd(7)} ${String(n).padStart(7)}  ${bar(n, maxVerdict)}`);
}

const ruleEntries = topEntries(byRule, 999);
if (ruleEntries.length > 0) {
  const maxRule = ruleEntries[0][1];
  console.log('\nrule firings');
  for (const [rule, n] of ruleEntries) {
    console.log(`  ${String(n).padStart(7)}  ${bar(n, maxRule)}  ${rule}`);
  }
}

console.log('\nlatency (µs, engine only)');
console.log(`  p50 ${pct(0.5).toFixed(1)} · p99 ${pct(0.99).toFixed(1)} · max ${(latencies.at(-1) ?? 0).toFixed(1)}`);

console.log('\nattention');
console.log(`  degraded rows     ${degradedCount}${degradedCount > 0 ? '  ← look at these first' : ''}`);
console.log(`  rule-error rows   ${errorRows}${errorRows > 0 ? '  ← rule coverage was reduced' : ''}`);
console.log(`  txnId repeats     ${dedupHint}${dedupHint > 0 ? '  ← retries outside the dedupe window re-evaluated' : ''}`);

const blocked = topEntries(blockedPayees, top);
if (blocked.length > 0) {
  console.log(`\ntop ${blocked.length} blocked payee VPAs (by count)`);
  for (const [vpa, n] of blocked) console.log(`  ${String(n).padStart(5)}  ${vpa}`);
}
const reviewed = topEntries(reviewPayees, top);
if (reviewed.length > 0) {
  console.log(`\ntop ${reviewed.length} review payee VPAs (by count)`);
  for (const [vpa, n] of reviewed) console.log(`  ${String(n).padStart(5)}  ${vpa}`);
}
