// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

/**
 * Fixed-capacity ring of (timestamp, aux) numeric pairs backed by typed
 * arrays. Used by velocity heuristics to keep per-entity history bounded so
 * a busy credit line can never grow memory unboundedly or trigger GC churn.
 *
 * `aux` carries whatever numeric the rule needs — a VPA hash, an amount, a
 * geo bucket id.
 *
 * Entries are assumed to be pushed in non-decreasing timestamp order; the
 * window walks stop at the first stale entry.
 */
export class RingBuffer {
  private readonly stamps: Float64Array;
  private readonly aux: Float64Array;
  private head = 0;
  private size = 0;

  constructor(readonly capacity: number) {
    this.stamps = new Float64Array(capacity);
    this.aux = new Float64Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  /** Entries oldest→newest as `(timestampMs, aux)` pairs — the snapshot form. */
  toEntries(): Array<[number, number]> {
    const out: Array<[number, number]> = new Array(this.size);
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - this.size + i + this.capacity) % this.capacity;
      out[i] = [this.stamps[idx]!, this.aux[idx]!];
    }
    return out;
  }

  /**
   * Replace contents from oldest→newest `(timestampMs, aux)` pairs. More
   * than `capacity` entries keeps only the newest `capacity` — same as if
   * they had been pushed in order.
   */
  loadEntries(entries: Iterable<readonly [number, number]>): void {
    this.head = 0;
    this.size = 0;
    for (const [ts, aux] of entries) this.push(ts, aux);
  }

  push(timestampMs: number, aux: number): void {
    this.stamps[this.head] = timestampMs;
    this.aux[this.head] = aux;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /**
   * Number of entries at most `windowMs` old. Closure-free; pair with
   * `auxAt` to iterate without allocating.
   */
  countWithin(windowMs: number, nowMs: number): number {
    let n = 0;
    while (n < this.size) {
      const idx = (this.head - 1 - n + this.capacity) % this.capacity;
      if (nowMs - this.stamps[idx]! > windowMs) break;
      n += 1;
    }
    return n;
  }

  /** `aux` value of the i-th newest entry (0 = newest); keep `i < length`. */
  auxAt(i: number): number {
    return this.aux[(this.head - 1 - i + this.capacity) % this.capacity]!;
  }

  /**
   * Invoke `cb` for every entry at most `windowMs` old, newest to oldest.
   * Returning `false` from the callback breaks early. Convenient but the
   * callback is a closure; hot paths should prefer `countWithin`/`auxAt`.
   */
  forEachWithin(
    windowMs: number,
    nowMs: number,
    cb: (timestampMs: number, aux: number) => boolean | void,
  ): void {
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.capacity) % this.capacity;
      const ts = this.stamps[idx]!;
      if (nowMs - ts > windowMs) return;
      if (cb(ts, this.aux[idx]!) === false) return;
    }
  }
}
