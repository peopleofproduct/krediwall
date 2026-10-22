/**
 * Fixed-capacity ring of (timestamp, aux) numeric pairs backed by typed
 * arrays. Used by velocity heuristics to keep per-entity history bounded so
 * a busy credit line can never grow memory unboundedly or trigger GC churn.
 *
 * `aux` carries whatever numeric the rule needs — a VPA hash, an amount, a
 * geo bucket id.
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

  push(timestampMs: number, aux: number): void {
    this.stamps[this.head] = timestampMs;
    this.aux[this.head] = aux;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /**
   * Invoke `cb` for every entry at most `windowMs` old, newest to oldest,
   * with zero allocation. Because pushes are chronological in practice the
   * walk stops at the first out-of-window entry. Returning `false` from the
   * callback breaks early.
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
