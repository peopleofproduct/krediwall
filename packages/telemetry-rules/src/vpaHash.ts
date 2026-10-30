// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

/**
 * FNV-1a 32-bit hash of a string, returned as a number.
 *
 * Rule state keeps this bucket id instead of the raw VPA string, so raw
 * identifiers are not retained in memory. It is a fast bucketing hash, NOT a
 * cryptographic one: VPAs are low-entropy and can be recovered by dictionary
 * search, and 32 bits can collide. Treat it as data minimisation, not as a
 * privacy guarantee.
 */
export function hashVpa(vpa: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < vpa.length; i++) {
    h ^= vpa.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
