// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

/**
 * Contract for the commercial multi-hop mule-ring scorer.
 *
 * The open-core build ships no implementation; `KrediwallAdapter` accepts
 * one via constructor options and delegates `evaluateGraphNetwork` to it.
 * This interface is the stable seam between the open engine and the paid
 * graph module — it is intentionally small so the private implementation
 * can evolve without breaking this package's API.
 */

/** What the evaluator is asked to score for one authorisation. */
export interface GraphQuery {
  /** Recipient VPA — the node the mule-ring check is about. */
  readonly payeeVpa: string;
  /** Transaction amount in paise, for amount-aware ring scoring. */
  readonly amountPaise: number;
  /** Authorisation timestamp, epoch ms. */
  readonly timestampMs: number;
}

/**
 * Result of a graph-network lookup. `checked: false` means the graph had
 * no coverage for this payee — callers must not treat it as "clean".
 */
export interface GraphSignal {
  readonly checked: boolean;
  /**
   * 0..1 suspiciousness: higher means the payee sits in a tighter drain
   * cluster of known or suspected mule accounts.
   */
  readonly muleRingScore: number;
  /** Size of the payee's connected drain cluster, when computed. */
  readonly clusterSize?: number;
  /**
   * Shortest graph distance to a known-fraud node. 0 means the payee
   * itself is a confirmed mule; undefined means none was reachable.
   */
  readonly distanceToKnownFraud?: number;
}

/** A scored lookup against the recipient graph. Implementations are async. */
export interface GraphEvaluator {
  readonly name: string;
  evaluate(query: GraphQuery): Promise<GraphSignal>;
}
