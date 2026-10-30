// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

interface Node<K, V> {
  readonly key: K;
  value: V;
  prev: Node<K, V> | null;
  next: Node<K, V> | null;
}

/**
 * Map with a hard entry cap and exact least-recently-used eviction, so
 * per-entity rule state (one entry per credit line) cannot grow without
 * bound over a long-running process.
 *
 * Recency is tracked with a doubly linked list rather than by re-inserting
 * keys into the `Map` on every read: delete-then-set churn leaves holes in
 * V8's hash table and triggers periodic O(n) compaction, which showed up as
 * multi-millisecond tail latency. Here a read only relinks list nodes; the
 * `Map` is mutated only when a key is first inserted or evicted.
 */
export class LruMap<K, V> {
  private readonly map = new Map<K, Node<K, V>>();
  private head: Node<K, V> | null = null; // most recently used
  private tail: Node<K, V> | null = null; // least recently used
  private evicted = 0;

  constructor(readonly maxEntries: number) {}

  get size(): number {
    return this.map.size;
  }

  /**
   * Entries dropped because the cap was reached. Evicted entities restart
   * their history if they reappear — a rising count means the tracked-set
   * cap is too small for the active population.
   */
  get evictedCount(): number {
    return this.evicted;
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    this.touch(node);
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = value;
      this.touch(existing);
      return;
    }
    const node: Node<K, V> = { key, value, prev: null, next: this.head };
    if (this.head !== null) this.head.prev = node;
    this.head = node;
    this.tail ??= node;
    this.map.set(key, node);
    if (this.map.size > this.maxEntries && this.tail !== null) {
      const lru = this.tail;
      this.unlink(lru);
      this.map.delete(lru.key);
      this.evicted += 1;
    }
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Iterate entries least-recently-used first. Serialising in this order
   * and restoring with `set` preserves the recency order.
   */
  *entriesLeastRecentFirst(): IterableIterator<[K, V]> {
    for (let node = this.tail; node !== null; node = node.prev) {
      yield [node.key, node.value];
    }
  }

  private touch(node: Node<K, V>): void {
    if (this.head === node) return;
    this.unlink(node);
    node.next = this.head;
    if (this.head !== null) this.head.prev = node;
    this.head = node;
  }

  private unlink(node: Node<K, V>): void {
    if (node.prev !== null) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next !== null) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }
}
