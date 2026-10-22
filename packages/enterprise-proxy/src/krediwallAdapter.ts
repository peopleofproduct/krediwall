import type { Evaluation, Rule, Transaction } from '@vayu/core';
import { FirewallEngine } from '@vayu/core';

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

/** Stub hook result for the future multi-hop mule-ring graph check. */
export interface GraphVerdict {
  readonly muleRingScore: number;
  readonly checked: boolean;
}

const UNCHECKED: GraphVerdict = { muleRingScore: 0, checked: false };

/**
 * Framework-neutral adapter sitting in the payment-processor switch
 * pipeline. `handleTransaction` is the synchronous hot path — verdict in,
 * verdict out. Commercial hooks are explicit seams the open-core build
 * leaves stubbed.
 */
export class VayuAdapter {
  private readonly engine: FirewallEngine;
  private readonly meter = new BillingMeter();

  constructor(rules: readonly Rule[]) {
    this.engine = new FirewallEngine(rules);
  }

  handleTransaction(txn: Transaction): Evaluation {
    this.meter.tick(Math.trunc(performance.now() * 1000));
    return this.engine.evaluate(txn);
  }

  /**
   * Paid-tier hook: intercept routing and score the recipient VPA against
   * multi-hop mule-ring graphs. Stubbed in the open-core build.
   */
  evaluateGraphNetwork(_payeeVpa: string): Promise<GraphVerdict> {
    return Promise.resolve(UNCHECKED);
  }

  /** Paid-tier hook: transactional throughput metering per µs window. */
  billingMeter(): BillingMeter {
    return this.meter;
  }
}
