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
}

/** The engine's verdict for one transaction plus telemetry about the eval. */
export interface Evaluation {
  readonly verdict: Verdict;
  readonly hits: readonly RuleHit[];
  /** Wall-clock microseconds spent inside `evaluate`. */
  readonly elapsedMicros: number;
}
