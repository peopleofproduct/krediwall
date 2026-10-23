import type { Rule } from '@krediwall/core';
import { dormantReactivation } from './dormant';
import { firstPayee } from './firstPayee';
import { muleDrain } from './muleDrain';
import { oddHours } from './oddHours';
import { structuring } from './structuring';
import { velocitySpike } from './velocitySpike';

/**
 * A starter Credit-on-UPI rule set. The defaults are **illustrative**: they
 * encode the fraud patterns in scope, not thresholds validated on production
 * traffic. Calibrate them against your own ticket distribution before use.
 *
 * Blocking legs (strong multi-signal patterns):
 * - more than 4 distinct payee VPAs or more than 2 geo cells inside 60s
 *   → velocity spike
 * - at least 2 repeat ₹45k–₹50k tickets burning ≥90% of limit inside 60s at
 *   unverified terminals → mule drain (BLOCK on lines approved within 24h,
 *   REVIEW on older lines)
 *
 * Review legs (weaker single signals, queued for a human/secondary check):
 * - first-seen payee drawing ≥50% of the limit in one shot → first-payee
 * - ≥3 tickets in the ₹90k–₹1L band inside 60s → structuring
 * - spend after ≥90 days idle → dormant reactivation
 * - spend in the 00:00–05:00 IST band on a line with no night history → odd-hours
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
    firstPayee({ minAmountRatio: 0.5 }),
    structuring({
      ticketFloorPaise: 90_000_00,
      ticketCeilPaise: 1_00_000_00,
      minRepeats: 3,
      windowMs: 60_000,
    }),
    dormantReactivation({ dormantMs: 90 * 86_400_000 }),
    oddHours({}),
  ];
}
