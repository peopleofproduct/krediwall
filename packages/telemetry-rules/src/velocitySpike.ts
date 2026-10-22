import type { Rule } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';
import { RingBuffer } from './ringBuffer';
import { hashVpa } from './vpaHash';

export interface VelocitySpikeOptions {
  /** Max distinct payee VPAs allowed inside `windowMs` before flagging. */
  readonly maxDistinctMerchants: number;
  /**
   * Max distinct geo cells allowed inside `windowMs` before flagging.
   * Checked only when transactions carry `geoCell`. Omit to disable the
   * geographical-mismatch leg of the rule.
   */
  readonly maxDistinctGeoCells?: number;
  /** Sliding window in milliseconds. */
  readonly windowMs: number;
  /**
   * Ring capacity per credit line; bounds memory per entity (each ring costs
   * 16 bytes per slot). If more transactions than this arrive inside the
   * window the oldest are dropped. Default 32.
   */
  readonly capacity?: number;
  /**
   * Max credit lines tracked at once. Least-recently-seen lines are evicted
   * (their history restarts if they reappear). Default 100,000.
   */
  readonly maxTrackedLines?: number;
}

interface LineRings {
  vpa: RingBuffer;
  /** Allocated lazily, only once a geo cell is seen and the geo check is on. */
  geo: RingBuffer | null;
}

/**
 * Snapshot form: `[creditLineId, rings]` pairs ordered least-recently-used
 * first, so `restoreState` reproduces the same eviction order.
 */
type VelocityState = ReadonlyArray<
  readonly [string, { readonly vpa: Array<[number, number]>; readonly geo: Array<[number, number]> | null }]
>;

/** Count distinct values collected in `scratch[0..n)`, zero-alloc. */
function countDistinct(scratch: Float64Array, n: number): number {
  let distinct = 0;
  for (let i = 0; i < n; i++) {
    let seen = false;
    for (let j = 0; j < i; j++) {
      if (scratch[j] === scratch[i]) {
        seen = true;
        break;
      }
    }
    if (!seen) distinct += 1;
  }
  return distinct;
}

/**
 * Velocity spike: a single credit line spraying spend across many distinct
 * merchant VPAs — optionally also across mismatched geographical cells —
 * inside a short sliding window. The classic mule-fanout pattern for
 * draining a freshly approved credit line before limits kick in.
 *
 * State is a per-line pair of fixed-size rings holding 32-bit bucket hashes
 * (not raw strings); the set of tracked lines is LRU-capped. Distinct counts
 * run over a reused scratch buffer with closure-free ring iteration.
 */
export function velocitySpike(options: VelocitySpikeOptions): Rule {
  const name = 'telemetry.velocity-spike';
  const capacity = options.capacity ?? 32;
  const lines = new LruMap<string, LineRings>(options.maxTrackedLines ?? 100_000);
  const scratch = new Float64Array(capacity);

  return {
    name,
    evaluate(txn, ctx) {
      let line = lines.get(txn.creditLineId);
      if (line === undefined) {
        line = { vpa: new RingBuffer(capacity), geo: null };
        lines.set(txn.creditLineId, line);
      }
      line.vpa.push(ctx.nowMs, hashVpa(txn.payeeVpa));
      if (txn.geoCell !== undefined && options.maxDistinctGeoCells !== undefined) {
        line.geo ??= new RingBuffer(capacity);
        line.geo.push(ctx.nowMs, hashVpa(txn.geoCell));
      }

      const nVpa = line.vpa.countWithin(options.windowMs, ctx.nowMs);
      for (let i = 0; i < nVpa; i++) scratch[i] = line.vpa.auxAt(i);
      const distinctVpas = countDistinct(scratch, nVpa);
      if (distinctVpas > options.maxDistinctMerchants) {
        return {
          rule: name,
          verdict: Verdict.Block,
          reason: `${distinctVpas} distinct payee VPAs in ${options.windowMs}ms (limit ${options.maxDistinctMerchants})`,
        };
      }

      if (options.maxDistinctGeoCells !== undefined && line.geo !== null) {
        const nGeo = line.geo.countWithin(options.windowMs, ctx.nowMs);
        for (let i = 0; i < nGeo; i++) scratch[i] = line.geo.auxAt(i);
        const distinctGeos = countDistinct(scratch, nGeo);
        if (distinctGeos > options.maxDistinctGeoCells) {
          return {
            rule: name,
            verdict: Verdict.Block,
            reason: `${distinctGeos} distinct geo cells in ${options.windowMs}ms (limit ${options.maxDistinctGeoCells})`,
          };
        }
      }
      return null;
    },
    reset() {
      lines.clear();
    },
    stats() {
      return {
        trackedLines: lines.size,
        maxTrackedLines: lines.maxEntries,
        evictedLines: lines.evictedCount,
      };
    },
    exportState(): VelocityState {
      const out: Array<[string, { vpa: Array<[number, number]>; geo: Array<[number, number]> | null }]> = [];
      for (const [key, line] of lines.entriesLeastRecentFirst()) {
        out.push([key, { vpa: line.vpa.toEntries(), geo: line.geo?.toEntries() ?? null }]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('velocity-spike: bad snapshot shape');
      lines.clear();
      for (const entry of state as VelocityState) {
        const [key, rings] = entry;
        if (typeof key !== 'string' || rings === null || !Array.isArray(rings.vpa)) continue;
        const vpa = new RingBuffer(capacity);
        vpa.loadEntries(rings.vpa);
        let geo: RingBuffer | null = null;
        if (Array.isArray(rings.geo)) {
          geo = new RingBuffer(capacity);
          geo.loadEntries(rings.geo);
        }
        lines.set(key, { vpa, geo });
      }
    },
  };
}
