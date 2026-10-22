import { readFileSync } from 'node:fs';
import type { FeedEntry, FriLevel } from './feed';
import { friEntry } from './feed';
import type { InMemoryFeed } from './feed';

/**
 * On-disk snapshot format (version 1). See docs/feed-snapshot-format.md.
 *
 * ```jsonc
 * {
 *   "version": 1,
 *   "generatedAtMs": 1760000000000,
 *   "entries": [
 *     { "mobile": "9876543210", "level": "very_high" },   // DoT FRI band
 *     { "mobile": "9123456789", "listed": true },          // hard-listed
 *     { "mobile": "9988776655", "riskScore": 0.8 }          // custom 0..1
 *   ]
 * }
 * ```
 */
export interface FriSnapshotFile {
  readonly version?: unknown;
  readonly generatedAtMs?: unknown;
  readonly entries?: unknown;
}

export interface SnapshotLoadResult {
  readonly loaded: number;
  readonly rejected: number;
  /** Snapshot generation time if the file declared one, else null. */
  readonly generatedAtMs: number | null;
  /** True when the snapshot is older than `opts.maxAgeMs` (if provided). */
  readonly stale: boolean;
  /** Up to 5 human-readable reasons rows were rejected, for ops debugging. */
  readonly sampleErrors: readonly string[];
}

export interface LoadSnapshotOptions {
  /**
   * Flag the result `stale` when `generatedAtMs` is older than this many
   * milliseconds relative to `nowMs`. A stale feed is still loaded — the
   * caller decides whether to alert or refuse.
   */
  readonly maxAgeMs?: number;
  /** Reference time for the staleness check; defaults to `Date.now()`. */
  readonly nowMs?: number;
  /** Safety rail against corrupt files; rows past this count are rejected. */
  readonly maxRows?: number;
}

const FRI_LEVELS: ReadonlySet<string> = new Set(['medium', 'high', 'very_high']);

const parseRow = (row: unknown): ({ mobile: string } & FeedEntry) | string => {
  if (typeof row !== 'object' || row === null) return 'row is not an object';
  const r = row as Record<string, unknown>;
  if (typeof r['mobile'] !== 'string' || r['mobile'].length === 0) {
    return 'missing/invalid mobile';
  }
  const listed = r['listed'] === true;
  if (listed) {
    const score =
      typeof r['riskScore'] === 'number' && Number.isFinite(r['riskScore'])
        ? Math.min(1, Math.max(0, r['riskScore']))
        : 1;
    return { mobile: r['mobile'], listed: true, riskScore: score };
  }
  if (r['level'] !== undefined) {
    if (typeof r['level'] !== 'string' || !FRI_LEVELS.has(r['level'])) {
      return `bad level ${JSON.stringify(r['level'])}`;
    }
    return { mobile: r['mobile'], ...friEntry(r['level'] as FriLevel) };
  }
  if (typeof r['riskScore'] === 'number' && Number.isFinite(r['riskScore'])) {
    if (r['riskScore'] < 0 || r['riskScore'] > 1) return 'riskScore out of range';
    return { mobile: r['mobile'], listed: false, riskScore: r['riskScore'] };
  }
  return 'row carries no signal (need level, listed or riskScore)';
};

/**
 * Parse snapshot JSON into validated ingest rows. Throws when the top-level
 * shape is wrong; row-level problems are reported, not thrown.
 */
export function parseFriSnapshot(json: string): {
  readonly generatedAtMs: number | null;
  readonly rows: ReadonlyArray<({ mobile: string } & FeedEntry)>;
  readonly rejected: number;
  readonly sampleErrors: readonly string[];
} {
  let doc: FriSnapshotFile;
  try {
    doc = JSON.parse(json) as FriSnapshotFile;
  } catch {
    throw new Error('snapshot is not valid JSON');
  }
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.entries)) {
    throw new Error('snapshot must be an object with an "entries" array');
  }
  const generatedAtMs =
    typeof doc.generatedAtMs === 'number' && Number.isFinite(doc.generatedAtMs)
      ? doc.generatedAtMs
      : null;

  const rows: Array<{ mobile: string } & FeedEntry> = [];
  const sampleErrors: string[] = [];
  let rejected = 0;
  for (const row of doc.entries) {
    const parsed = parseRow(row);
    if (typeof parsed === 'string') {
      rejected += 1;
      if (sampleErrors.length < 5) sampleErrors.push(parsed);
      continue;
    }
    rows.push(parsed);
  }
  return { generatedAtMs, rows, rejected: rejected, sampleErrors };
}

/**
 * Load a version-1 FRI snapshot file into an `InMemoryFeed`, replacing its
 * contents. Rows with unnormalisable mobile numbers are rejected by the
 * feed itself; malformed rows are rejected by the parser first.
 */
export function loadFriSnapshotFile(
  feed: InMemoryFeed,
  path: string,
  opts?: LoadSnapshotOptions,
): SnapshotLoadResult {
  const parsed = parseFriSnapshot(readFileSync(path, 'utf8'));
  const maxRows = opts?.maxRows ?? 5_000_000;
  const rows = parsed.rows.slice(0, maxRows);
  const rowCapRejected = parsed.rejected + (parsed.rows.length - rows.length);
  const sampleErrors = [...parsed.sampleErrors];
  if (parsed.rows.length > rows.length && sampleErrors.length < 5) {
    sampleErrors.push(`exceeded maxRows ${maxRows}`);
  }

  const ingested = feed.ingest(rows);
  const nowMs = opts?.nowMs ?? Date.now();
  const stale =
    opts?.maxAgeMs !== undefined &&
    parsed.generatedAtMs !== null &&
    nowMs - parsed.generatedAtMs > opts.maxAgeMs;

  return {
    loaded: ingested.loaded,
    rejected: ingested.rejected + rowCapRejected,
    generatedAtMs: parsed.generatedAtMs,
    stale,
    sampleErrors,
  };
}
