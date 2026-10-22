import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { EngineSnapshot } from '@krediwall/core';

const isEngineSnapshot = (v: unknown): v is EngineSnapshot =>
  typeof v === 'object' &&
  v !== null &&
  (v as EngineSnapshot).version === 1 &&
  typeof (v as EngineSnapshot).exportedAtMs === 'number' &&
  Number.isFinite((v as EngineSnapshot).exportedAtMs) &&
  typeof (v as EngineSnapshot).rules === 'object' &&
  (v as EngineSnapshot).rules !== null;

/**
 * Persist an engine snapshot to disk atomically: the JSON is written to a
 * sibling temp file and renamed over the target, so a crash mid-write
 * cannot leave a half-written state file. The temp file must live in the
 * same directory — `rename` is only atomic within one filesystem.
 *
 * The engine deliberately never writes anywhere itself; this helper is
 * the file-store answer for integrators who want restart warm-up without
 * bringing a database.
 */
export function writeStateFile(snapshot: EngineSnapshot, path: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot), 'utf8');
  renameSync(tmp, path);
}

/**
 * Read a state file written by `writeStateFile`. Throws on missing files,
 * invalid JSON or a shape that is not a version-1 `EngineSnapshot`.
 */
export function readStateFile(path: string): EngineSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`state file ${path} is missing or not valid JSON`);
  }
  if (!isEngineSnapshot(raw)) {
    throw new Error(`state file ${path} is not a version-1 engine snapshot`);
  }
  return raw;
}
