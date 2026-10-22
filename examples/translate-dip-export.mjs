// DIP/FRI export translator — template for the one integrator-side piece.
//
//   node examples/translate-dip-export.mjs --input dip.csv --output fri-latest.json
//
// Whatever your Digital Intelligence Platform delivery gives you —
// CSV, a JSON array, or newline-delimited JSON — this script maps it to
// the strict snapshot format Krediwall's loader accepts
// (docs/feed-snapshot-format.md). Adapt the column guesses to your actual
// export; the output contract does not change.
//
// Flags:
//   --input=PATH   (required) source export: .csv, .json array, or .ndjson
//   --output=PATH  (required) snapshot file to write
//   --mobile-col=N positional CSV column override for the mobile field
//   --vpa-col=N    positional CSV column override for the VPA field
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const require = createRequire(import.meta.url);
const { normalizeMobile, normalizeVpa } = require('@krediwall/dpi-adapters');

const flag = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : undefined;
};
const input = flag('input');
const output = flag('output');
if (input === undefined || output === undefined) {
  console.error('usage: --input=PATH --output=PATH');
  process.exit(1);
}

// --- read the export into generic row objects -----------------------------
// Header names we guess when present; positional CSV uses --*-col or 0/1.
const MOBILE_KEYS = ['mobile', 'msisdn', 'phone', 'phone_number', 'number'];
const VPA_KEYS = ['vpa', 'upi', 'upi_id', 'payee_vpa', 'handle'];
const LEVEL_KEYS = ['level', 'fri_level', 'fri', 'risk_level', 'band'];
const LISTED_KEYS = ['listed', 'is_listed', 'blocked', 'suspect', 'flagged'];
const SCORE_KEYS = ['riskscore', 'risk_score', 'score'];

const pick = (row, keys) => {
  for (const k of keys) {
    if (typeof row[k] === 'string' || typeof row[k] === 'number' || typeof row[k] === 'boolean') {
      return row[k];
    }
  }
  return undefined;
};

const parseDelimited = (line) => {
  // No quoted-comma handling: feed exports don't carry prose. If yours
  // does, reach for a real CSV parser — this stays dependency-free.
  return line.split(',').map((c) => c.trim());
};

const rowsFromCsv = (text, mobileCol, vpaCol) => {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const header = parseDelimited(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) =>
    [...MOBILE_KEYS, ...VPA_KEYS, ...LEVEL_KEYS, ...LISTED_KEYS, ...SCORE_KEYS].includes(h),
  );
  const rows = [];
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cols = parseDelimited(line);
    if (hasHeader) {
      rows.push(Object.fromEntries(header.map((h, i) => [h, cols[i]])));
    } else {
      rows.push({ mobile: cols[mobileCol ?? 0], vpa: vpaCol !== undefined ? cols[vpaCol] : undefined });
    }
  }
  return rows;
};

const rowsFromJson = (text) => {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
};

const ext = extname(input).toLowerCase();
const text = readFileSync(input, 'utf8');
const rows =
  ext === '.json'
    ? rowsFromJson(text)
    : ext === '.ndjson'
      ? text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l))
      : rowsFromCsv(text, flag('mobile-col') !== undefined ? Number(flag('mobile-col')) : undefined,
          flag('vpa-col') !== undefined ? Number(flag('vpa-col')) : undefined);

// --- map rows to snapshot entries ------------------------------------------
const LEVELS = { medium: 'medium', high: 'high', very_high: 'very_high', 'very high': 'very_high' };
const TRUTHY = new Set(['true', '1', 'yes', 'y', 'listed']);

const entries = [];
const skipped = [];
let signaless = 0;
for (const row of rows) {
  if (typeof row !== 'object' || row === null) {
    skipped.push('not an object');
    continue;
  }
  const mobileRaw = pick(row, MOBILE_KEYS);
  const vpaRaw = pick(row, VPA_KEYS);
  const mobile = mobileRaw !== undefined ? normalizeMobile(String(mobileRaw)) : null;
  const vpa = vpaRaw !== undefined ? normalizeVpa(String(vpaRaw)) : null;
  if (mobile === null && vpa === null) {
    skipped.push(`no valid identifier: ${JSON.stringify(row).slice(0, 80)}`);
    continue;
  }
  const id = { ...(mobile !== null ? { mobile } : {}), ...(vpa !== null ? { vpa } : {}) };

  const level = pick(row, LEVEL_KEYS);
  const listed = pick(row, LISTED_KEYS);
  const score = pick(row, SCORE_KEYS);
  if (listed !== undefined && TRUTHY.has(String(listed).toLowerCase())) {
    entries.push({ ...id, listed: true });
  } else if (level !== undefined && LEVELS[String(level).toLowerCase()] !== undefined) {
    entries.push({ ...id, level: LEVELS[String(level).toLowerCase()] });
  } else if (score !== undefined && Number.isFinite(Number(score))) {
    entries.push({ ...id, riskScore: Number(score) });
  } else {
    // A bare list of identifiers is conventionally a hard list
    // (suspect/revoked registries). Flagged loudly below.
    signaless += 1;
    entries.push({ ...id, listed: true });
  }
}

const doc = { version: 1, generatedAtMs: Date.now(), entries };
writeFileSync(output, JSON.stringify(doc, null, 1) + '\n', 'utf8');
console.log(`translated ${rows.length} rows → ${entries.length} entries → ${output}`);
if (skipped.length > 0) {
  console.warn(`skipped ${skipped.length} rows, e.g.: ${skipped.slice(0, 3).join(' | ')}`);
}
if (signaless > 0) {
  console.warn(
    `${signaless} rows carried no risk signal — emitted as listed:true (hard list). ` +
      'If your export has a risk column this script missed, extend the *_KEYS lists.',
  );
}
