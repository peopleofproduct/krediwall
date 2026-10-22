import type { Rule } from '@vayu/core';
import { Verdict } from '@vayu/core';
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
  /** Sliding window in milliseconds (Credit-on-UPI default: 60s). */
  readonly windowMs: number;
  /** Ring capacity per credit line; bounds memory per entity. */
  readonly capacity?: number;
}

interface LineRings {
  vpa: RingBuffer;
  geo: RingBuffer;
}

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
 * inside a short window. The classic mule-fanout pattern for draining a
 * freshly approved credit line before limits kick in.
 *
 * State is a per-line pair of rings holding hashed VPAs/geos; distinct
 * counts run over reused scratch buffers so the hot path allocates nothing
 * once the per-line rings exist.
 */
export function velocitySpike(options: VelocitySpikeOptions): Rule {
  const name = 'telemetry.velocity-spike';
  const capacity = options.capacity ?? 64;
  const rings = new Map<string, LineRings>();
  const scratch = new Float64Array(capacity);

  return {
    name,
    evaluate(txn, ctx) {
      let line = rings.get(txn.creditLineId);
      if (line === undefined) {
        line = { vpa: new RingBuffer(capacity), geo: new RingBuffer(capacity) };
        rings.set(txn.creditLineId, line);
      }
      line.vpa.push(ctx.nowMs, hashVpa(txn.payeeVpa));
      if (txn.geoCell !== undefined) {
        line.geo.push(ctx.nowMs, hashVpa(txn.geoCell));
      }

      let n = 0;
      line.vpa.forEachWithin(options.windowMs, ctx.nowMs, (_ts, aux) => {
        scratch[n++] = aux;
      });
      const distinctVpas = countDistinct(scratch, n);
      if (distinctVpas > options.maxDistinctMerchants) {
        return {
          rule: name,
          verdict: Verdict.Block,
          reason: `${distinctVpas} distinct payee VPAs in ${options.windowMs}ms (limit ${options.maxDistinctMerchants})`,
        };
      }

      if (options.maxDistinctGeoCells !== undefined) {
        n = 0;
        line.geo.forEachWithin(options.windowMs, ctx.nowMs, (_ts, aux) => {
          scratch[n++] = aux;
        });
        const distinctGeos = countDistinct(scratch, n);
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
      rings.clear();
    },
  };
}
