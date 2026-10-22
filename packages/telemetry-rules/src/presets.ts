import type { Rule } from '@krediwall/core';
import { muleDrain } from './muleDrain';
import { velocitySpike } from './velocitySpike';

/**
 * A starter Credit-on-UPI rule set. The defaults are **illustrative**: they
 * encode the fraud patterns in scope, not thresholds validated on production
 * traffic. Calibrate them against your own ticket distribution before use.
 *
 * - more than 4 distinct payee VPAs or more than 2 geo cells inside 60s
 *   → velocity spike
 * - at least 2 repeat ₹45k–₹50k tickets burning ≥90% of limit inside 60s at
 *   unverified terminals → mule drain (BLOCK on lines approved within 24h,
 *   REVIEW on older lines)
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
