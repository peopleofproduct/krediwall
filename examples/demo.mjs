// Run with: npm run demo   (builds first, then replays three scenarios)
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { KrediwallAdapter } = require('@krediwall/enterprise-proxy');
const { creditOnUpiRules } = require('@krediwall/telemetry-rules');
const { feedReputationRule, friEntry, friFeed } = require('@krediwall/dpi-adapters');

const T0 = Date.now();
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const colour = (code, s) => (process.stdout.isTTY ? `\u001b[${code}m${s}\u001b[0m` : s);
const VERDICT_COLOUR = { ALLOW: '32', REVIEW: '33', BLOCK: '31' };

const base = {
  creditLineId: 'line-demo',
  payerVpa: 'borrower@okbank',
  creditLimitPaise: 1_00_000_00,
  terminalVerified: true,
};

function run(title, rules, steps) {
  console.log(`\n${colour('1', title)}`);
  const adapter = new KrediwallAdapter(rules);
  steps.forEach(([offsetMs, label, txn], i) => {
    const result = adapter.handleTransaction({
      ...base,
      txnId: `txn-${i + 1}`,
      timestampMs: T0 + offsetMs,
      ...txn,
    });
    const verdict = colour(VERDICT_COLOUR[result.verdict], result.verdict.padEnd(6));
    const why = result.hits[0]?.reason ?? 'no rule fired';
    console.log(
      `  +${String(offsetMs / 1000).padStart(4)}s  ${verdict} ${rupees(txn.amountPaise).padStart(9)}  ${label}`,
    );
    console.log(`            ${colour('2', `${why}  (${result.elapsedMicros.toFixed(0)} µs)`)}`);
  });
}

console.log(colour('1', 'Krediwall demo — illustrative rules, synthetic data'));

run('1. Normal day-to-day spend', creditOnUpiRules(), [
  [0, 'chai stall', { payeeVpa: 'chai@okbank', amountPaise: 40_00 }],
  [3_600_000, 'grocery', { payeeVpa: 'grocer@okbank', amountPaise: 850_00 }],
]);

run('2. Fresh credit line sprayed across many payees in seconds', creditOnUpiRules(), [
  [0, 'payee 1', { payeeVpa: 'a@ybl', amountPaise: 9_000_00, geoCell: 'blr' }],
  [1_000, 'payee 2', { payeeVpa: 'b@ybl', amountPaise: 9_000_00, geoCell: 'blr' }],
  [2_000, 'payee 3', { payeeVpa: 'c@ybl', amountPaise: 9_000_00, geoCell: 'blr' }],
  [3_000, 'payee 4', { payeeVpa: 'd@ybl', amountPaise: 9_000_00, geoCell: 'blr' }],
  [4_000, 'payee 5', { payeeVpa: 'e@ybl', amountPaise: 9_000_00, geoCell: 'blr' }],
]);

run('3. Repeat large tickets to unverified terminals drain ~100% of the limit', creditOnUpiRules(), [
  [
    0,
    'unverified terminal',
    { payeeVpa: 'pos1@ybl', amountPaise: 49_999_00, terminalVerified: false, creditLineApprovedAtMs: T0 - 1_200_000 },
  ],
  [
    7_000,
    'unverified terminal',
    { payeeVpa: 'pos1@ybl', amountPaise: 49_999_00, terminalVerified: false, creditLineApprovedAtMs: T0 - 1_200_000 },
  ],
]);

const fri = friFeed('demo-only-key');
fri.ingest([{ mobile: '9876543210', ...friEntry('very_high') }]);
run('4. Payee mobile number flagged High/Very High in an FRI snapshot', [feedReputationRule([fri])], [
  [0, 'payee 9876543210@ybl', { payeeVpa: '9876543210@ybl', amountPaise: 5_000_00 }],
  [1_000, 'payee 9123456789@ybl', { payeeVpa: '9123456789@ybl', amountPaise: 5_000_00 }],
]);

console.log('\nDone. See docs/executive-summary.md for what these rules do and do not cover.\n');
