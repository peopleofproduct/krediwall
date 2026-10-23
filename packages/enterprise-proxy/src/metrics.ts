import type { EngineMetrics } from '@krediwall/core';

const esc = (label: string): string =>
  label.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

/**
 * Render engine counters and per-rule stats in Prometheus text exposition
 * format — the de-facto scrape standard, so existing dashboards and
 * alerting pick Krediwall up without any client library. Hand the output
 * to whatever serves your monitoring (the HTTP gateway exposes it on
 * `GET /metrics`; in-process integrators can render it anywhere else).
 */
export function renderPrometheus(
  metrics: EngineMetrics,
  ruleStats: Readonly<Record<string, Readonly<Record<string, number>>>>,
): string {
  const out: string[] = [
    '# HELP krediwall_evaluations_total Authorisations evaluated',
    '# TYPE krediwall_evaluations_total counter',
    `krediwall_evaluations_total ${metrics.evaluated}`,
    '# HELP krediwall_verdict_total Verdicts produced, by verdict',
    '# TYPE krediwall_verdict_total counter',
    `krediwall_verdict_total{verdict="ALLOW"} ${metrics.verdicts.allow}`,
    `krediwall_verdict_total{verdict="REVIEW"} ${metrics.verdicts.review}`,
    `krediwall_verdict_total{verdict="BLOCK"} ${metrics.verdicts.block}`,
    '# HELP krediwall_rule_hit_total Positive rule firings, by rule',
    '# TYPE krediwall_rule_hit_total counter',
  ];
  for (const [rule, count] of Object.entries(metrics.ruleHits)) {
    out.push(`krediwall_rule_hit_total{rule="${esc(rule)}"} ${count}`);
  }
  out.push(
    '# HELP krediwall_rule_error_total Rules that threw, by rule — nonzero means degraded coverage',
    '# TYPE krediwall_rule_error_total counter',
  );
  for (const [rule, count] of Object.entries(metrics.ruleErrors)) {
    out.push(`krediwall_rule_error_total{rule="${esc(rule)}"} ${count}`);
  }
  out.push(
    '# HELP krediwall_hook_errors_total Audit/error hooks that threw',
    '# TYPE krediwall_hook_errors_total counter',
    `krediwall_hook_errors_total ${metrics.hookErrors}`,
    '# HELP krediwall_deduped_total Repeat txnIds answered from the dedupe cache',
    '# TYPE krediwall_deduped_total counter',
    `krediwall_deduped_total ${metrics.deduped}`,
    '# HELP krediwall_eval_latency_micros Evaluation latency histogram (µs)',
    '# TYPE krediwall_eval_latency_micros histogram',
  );
  // Prometheus histogram buckets are cumulative: count all evals ≤ bound.
  let cumulative = 0;
  metrics.latencyMicros.buckets.forEach((bound, i) => {
    cumulative += metrics.latencyMicros.counts[i] ?? 0;
    out.push(`krediwall_eval_latency_micros_bucket{le="${bound}"} ${cumulative}`);
  });
  cumulative += metrics.latencyMicros.counts[metrics.latencyMicros.buckets.length] ?? 0;
  out.push(
    'krediwall_eval_latency_micros_bucket{le="+Inf"} ' + cumulative,
    `krediwall_eval_latency_micros_sum ${metrics.latencyMicros.sum}`,
    `krediwall_eval_latency_micros_count ${metrics.evaluated}`,
  );

  const statNames = new Set<string>();
  for (const stats of Object.values(ruleStats)) {
    for (const name of Object.keys(stats)) statNames.add(name);
  }
  for (const stat of statNames) {
    out.push(`# TYPE krediwall_rule_stat_${stat} gauge`);
    for (const [rule, stats] of Object.entries(ruleStats)) {
      const value = stats[stat];
      if (value !== undefined) {
        out.push(`krediwall_rule_stat_${stat}{rule="${esc(rule)}"} ${value}`);
      }
    }
  }
  return out.join('\n') + '\n';
}
