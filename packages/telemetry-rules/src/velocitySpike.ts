import type { Rule } from '@vayu/core';
import { Verdict } from '@vayu/core';
import { RingBuffer } from './ringBuffer';
import { hashVpa } from './vpaHash';

export interface VelocitySpikeOptions {
  /** Max distinct payee VPAs allowed inside `windowMs` before flagging. */
  readonly maxDistinctMerchants: number;
  /** Sliding window in milliseconds (Credit-on-UPI default: 60s). */
  readonly windowMs: number;
  /** Ring capacity per credit line; bounds memory per entity. */
  readonly capacity?: number;
}

/**
 * Velocity spike: a single credit line spraying spend across many distinct
 * merchant VPAs inside a short window — the classic mule-fanout pattern for
 * draining a freshly approved credit line before limits kick in.
 *
 * State is a per-line ring of hashed VPAs; the distinct count is computed
 * over a reused scratch buffer so the hot path allocates nothing once the
 * per-line ring exists.
 */
export function velocitySpike(options: VelocitySpikeOptions): Rule {
  const name = 'telemetry.velocity-spike';
  const capacity = options.capacity ?? 64;
  const rings = new Map<string, RingBuffer>();
  const scratch = new Float64Array(capacity);

  return {
    name,
    evaluate(txn, ctx) {
      let ring = rings.get(txn.creditLineId);
      if (ring === undefined) {
        ring = new RingBuffer(capacity);
        rings.set(txn.creditLineId, ring);
      }
      ring.push(ctx.nowMs, hashVpa(txn.payeeVpa));

      let n = 0;
      ring.forEachWithin(options.windowMs, ctx.nowMs, (_ts, aux) => {
        scratch[n++] = aux;
      });

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

      if (distinct > options.maxDistinctMerchants) {
        return {
          rule: name,
          verdict: Verdict.Block,
          reason: `${distinct} distinct payee VPAs in ${options.windowMs}ms (limit ${options.maxDistinctMerchants})`,
        };
      }
      return null;
    },
    reset() {
      rings.clear();
    },
  };
}
