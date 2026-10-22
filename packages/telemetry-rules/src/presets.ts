import type { Rule } from '@vayu/core';
import { muleDrain } from './muleDrain';
import { velocitySpike } from './velocitySpike';

/**
 * The standard Credit-on-UPI rule set with defaults tuned to the fraud
 * patterns in scope:
 * - >4 distinct payee VPAs or >2 geo cells inside 60s → velocity spike
 * - ≥2 repeat ₹45k–₹50k tickets burning ≥90% of limit inside 60s at
 *   unverified terminals → mule drain (BLOCK on fresh lines, REVIEW on
 *   lines older than 24h)
 */
export function creditOnUpiRules(): Rule[] {
  return [
    velocitySpike({
      maxDistinctMerchants: 4,
      maxDistinctGeoCells: 2,
      windowMs: 60_000,
    }),
    muleDrain({
      limitBurnRatio: 0.9,
      windowMs: 60_000,
      ticketFloorPaise: 45_000_00,
      ticketCeilPaise: 50_000_00,
      minRepeats: 2,
      freshLineMaxAgeMs: 86_400_000,
    }),
  ];
}
