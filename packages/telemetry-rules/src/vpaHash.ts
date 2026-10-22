/**
 * FNV-1a 32-bit hash of a VPA string, returned as a number.
 * Raw VPA strings are never retained in rule state — only this
 * non-reversible bucket id — which keeps telemetry free of user PII.
 */
export function hashVpa(vpa: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < vpa.length; i++) {
    h ^= vpa.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
