import type { Evaluation, FirewallEngineOptions, Rule, Transaction } from '@krediwall/core';
import { FirewallEngine } from '@krediwall/core';
import type { GraphEvaluator, GraphQuery, GraphSignal } from './graph';

/** Throughput accounting for the commercial billing hook. */
export interface MeterWindow {
  readonly windowStartMicros: number;
  readonly evaluations: number;
}

/**
 * Slotted throughput meter: counts evaluations inside fixed microsecond
 * windows. A real deployment ships these aggregates to the billing plane;
 * here they are only accumulated in memory.
 */
export class BillingMeter {
  private windowStart = 0;
  private count = 0;
  private readonly windows: MeterWindow[] = [];

  constructor(private readonly windowMicros = 1_000_000) {}

  tick(nowMicros: number): void {
    const slot = nowMicros - (nowMicros % this.windowMicros);
    if (slot !== this.windowStart) {
      if (this.count > 0) {
        this.windows.push({ windowStartMicros: this.windowStart, evaluations: this.count });
      }
      this.windowStart = slot;
      this.count = 0;
    }
    this.count += 1;
  }

  get completedWindows(): readonly MeterWindow[] {
    return this.windows;
  }
}

/** @deprecated Use `GraphSignal` from `./graph`; kept for one release. */
export type GraphVerdict = GraphSignal;

const UNCHECKED: GraphSignal = { muleRingScore: 0, checked: false };

export interface KrediwallAdapterOptions {
  /**
   * Optional commercial graph evaluator; when present, authorisations are
   * also scored against the recipient mule-ring graph.
   */
  readonly graph?: GraphEvaluator;
  /** Passed through to the `FirewallEngine` (audit hook, error hook). */
  readonly engine?: FirewallEngineOptions;
}

/**
 * Framework-neutral adapter sitting in the payment-processor switch
 * pipeline. `handleTransaction` is the synchronous hot path — verdict in,
 * verdict out. Commercial hooks are explicit seams: supply a
 * `GraphEvaluator` to switch the stub off; the billing meter feeds the
 * usage-based commercial tier.
 */
export class KrediwallAdapter {
  private readonly engine: FirewallEngine;
  private readonly graph: GraphEvaluator | undefined;
  private readonly meter = new BillingMeter();

  constructor(rules: readonly Rule[], options?: KrediwallAdapterOptions) {
    this.engine = new FirewallEngine(rules, options?.engine);
    this.graph = options?.graph;
  }

  handleTransaction(txn: Transaction): Evaluation {
    this.meter.tick(Math.trunc(performance.now() * 1000));
    return this.engine.evaluate(txn);
  }

  /**
   * Recipient-VPA mule-ring check. Delegates to the configured
   * `GraphEvaluator`; returns `checked: false` when none is wired in —
   * callers must treat that as "no coverage", not "clean".
   */
  evaluateGraphNetwork(query: GraphQuery): Promise<GraphSignal> {
    return this.graph === undefined
      ? Promise.resolve(UNCHECKED)
      : this.graph.evaluate(query);
  }

  /** Paid-tier hook: transactional throughput metering per µs window. */
  billingMeter(): BillingMeter {
    return this.meter;
  }

  /** Engine state for restart warm-up / replica seeding. */
  exportState() {
    return this.engine.exportState();
  }

  restoreState(snapshot: Parameters<FirewallEngine['restoreState']>[0]): void {
    this.engine.restoreState(snapshot);
  }
}
