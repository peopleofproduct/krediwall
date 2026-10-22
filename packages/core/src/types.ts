/** Decision returned by the firewall for a single authorization attempt. */
export enum Verdict {
  Allow = 'ALLOW',
  Review = 'REVIEW',
  Block = 'BLOCK',
}

/**
 * A single Credit-on-UPI authorization request.
 * All monetary values are integer paise; timestamps are epoch milliseconds.
 * Raw identifiers (VPA strings) never leave the evaluation boundary.
 */
export interface Transaction {
  /** PSP-assigned transaction identifier (UPI RRN or equivalent). */
  readonly txnId: string;
  /** Lender-side identifier for the credit line / loan account drawn on. */
  readonly creditLineId: string;
  /** Payer virtual payment address (credit-line-linked VPA). */
  readonly payerVpa: string;
  /** Payee / merchant virtual payment address. */
  readonly payeeVpa: string;
  /** Transaction amount in paise. */
  readonly amountPaise: number;
  /** Sanctioned limit on the credit line in paise. */
  readonly creditLimitPaise: number;
  /** Authorization request timestamp, epoch ms. */
  readonly timestampMs: number;
  /** Merchant category code, when supplied by the switch. */
  readonly mcc?: number;
  /** Coarse geography bucket (city/cell id), never raw lat-long. */
  readonly geoCell?: string;
  /** When the credit line was approved/disbursed, epoch ms. Feeds fresh-line heuristics. */
  readonly creditLineApprovedAtMs?: number;
  /** Whether the acquiring terminal passed PSP verification. */
  readonly terminalVerified: boolean;
}

/** Extra data a rule may consult besides the transaction itself. */
export interface RuleContext {
  readonly nowMs: number;
}

/** A positive rule firing — the engine folds these into a final verdict. */
export interface RuleHit {
  readonly rule: string;
  readonly verdict: Verdict;
  readonly reason: string;
  /**
   * Structured evidence behind `reason` — the numbers that produced the
   * firing (counts, ratios, bands). Kept flat and JSON-safe so verdict
   * records can justify a decision in an audit or FMR filing without
   * re-parsing prose.
   */
  readonly evidence?: Readonly<Record<string, number | string>>;
}

/** A rule that threw inside `evaluate()`. Recorded and reported, never thrown. */
export interface RuleError {
  readonly rule: string;
  readonly message: string;
}

/**
 * A synchronous, allocation-frugal heuristic.
 * Implementations keep per-entity state internally and must tolerate
 * out-of-order timestamps without corrupting that state.
 */
export interface Rule {
  readonly name: string;
  evaluate(txn: Transaction, ctx: RuleContext): RuleHit | null;
  /** Drop all accumulated state; used between replays and tests. */
  reset?(): void;
  /**
   * Serialisable copy of accumulated per-entity state (JSON-safe values
   * only). Lets a restarted process or warm replica pick up where this
   * instance left off. Rules that keep no state omit it.
   */
  exportState?(): unknown;
  /** Replace accumulated state from a previous `exportState()` output. */
  restoreState?(state: unknown): void;
  /**
   * Internal counters for observability (e.g. `trackedLines`,
   * `evictedLines`). Called on demand — never on the hot path.
   */
  stats?(): Readonly<Record<string, number>>;
}

/** The engine's verdict for one transaction plus telemetry about the eval. */
export interface Evaluation {
  readonly verdict: Verdict;
  readonly hits: readonly RuleHit[];
  /**
   * Rules that threw during this evaluation. Their absence from `hits`
   * means the verdict was computed without them; alert on this field.
   * Empty when every rule ran cleanly.
   */
  readonly ruleErrors: readonly RuleError[];
  /**
   * True when the verdict was computed with degraded coverage — malformed
   * input or at least one rule that threw. A big red flag on the result;
   * alert on it rather than trusting the verdict at face value.
   */
  readonly degraded: boolean;
  /** Wall-clock microseconds spent inside `evaluate`. */
  readonly elapsedMicros: number;
}
