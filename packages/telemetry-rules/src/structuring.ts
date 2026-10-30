// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import type { Rule } from '@krediwall/core';
import { Verdict } from '@krediwall/core';
import { LruMap } from './lruMap';
import { RingBuffer } from './ringBuffer';

export interface StructuringOptions {
  /** Lower bound (paise) of the suspicious sub-threshold band. */
  readonly ticketFloorPaise: number;
  /** Upper bound (paise, exclusive sense) of the band — the threshold being dodged. */
  readonly ticketCeilPaise: number;
  /** Band tickets inside `windowMs` needed to flag. Default 3. */
  readonly minRepeats?: number;
  /** Sliding window in milliseconds. */
  readonly windowMs: number;
  /** Verdict to emit. Default REVIEW. */
  readonly verdict?: Verdict;
  /** Transactions remembered per line (16 bytes/slot). Default 32. */
  readonly capacity?: number;
  /** Max credit lines tracked at once (LRU-evicted). Default 100,000. */
  readonly maxTrackedLines?: number;
}

/** Snapshot form: `[creditLineId, ringEntries]` pairs, LRU-order preserved. */
type StructuringState = ReadonlyArray<readonly [string, Array<[number, number]>]>;

/**
 * Structuring (smurfing): repeated tickets clustered just under a round
 * threshold — the classic shape of someone splitting a transfer to dodge
 * a scrutiny or velocity band. Unlike `muleDrain`, no terminal or
 * limit-burn requirement: the signal is the repetition pattern itself,
 * so it flags at REVIEW regardless of where the money goes.
 */
export function structuring(options: StructuringOptions): Rule {
  const name = 'telemetry.structuring';
  const minRepeats = options.minRepeats ?? 3;
  const verdict = options.verdict ?? Verdict.Review;
  const capacity = options.capacity ?? 32;
  const lines = new LruMap<string, RingBuffer>(options.maxTrackedLines ?? 100_000);

  return {
    name,
    evaluate(txn, ctx) {
      let ring = lines.get(txn.creditLineId);
      if (ring === undefined) {
        ring = new RingBuffer(capacity);
        lines.set(txn.creditLineId, ring);
      }
      ring.push(ctx.nowMs, txn.amountPaise);

      const n = ring.countWithin(options.windowMs, ctx.nowMs);
      let bandTickets = 0;
      for (let i = 0; i < n; i++) {
        const amount = ring.auxAt(i);
        if (amount >= options.ticketFloorPaise && amount <= options.ticketCeilPaise) {
          bandTickets += 1;
        }
      }
      if (bandTickets < minRepeats) return null;
      return {
        rule: name,
        verdict,
        reason: `${bandTickets} repeat tickets in ${options.ticketFloorPaise / 100}–${options.ticketCeilPaise / 100} band within ${options.windowMs}ms`,
        evidence: {
          bandTickets,
          windowMs: options.windowMs,
          floorPaise: options.ticketFloorPaise,
          ceilPaise: options.ticketCeilPaise,
        },
      };
    },
    reset() {
      lines.clear();
    },
    stats() {
      return {
        trackedLines: lines.size,
        maxTrackedLines: lines.maxEntries,
        evictedLines: lines.evictedCount,
      };
    },
    exportState(): StructuringState {
      const out: Array<[string, Array<[number, number]>]> = [];
      for (const [key, ring] of lines.entriesLeastRecentFirst()) {
        out.push([key, ring.toEntries()]);
      }
      return out;
    },
    restoreState(state: unknown): void {
      if (!Array.isArray(state)) throw new Error('structuring: bad snapshot shape');
      lines.clear();
      for (const entry of state as StructuringState) {
        const [key, entries] = entry;
        if (typeof key !== 'string' || !Array.isArray(entries)) continue;
        const ring = new RingBuffer(capacity);
        ring.loadEntries(entries);
        lines.set(key, ring);
      }
    },
  };
}
