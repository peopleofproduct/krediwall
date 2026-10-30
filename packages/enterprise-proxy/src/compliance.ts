// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

import type { Verdict } from '@krediwall/core';

/** A rule firing that may constitute a reportable fraud / cyber incident. */
export interface IncidentRecord {
  readonly txnId: string;
  readonly rule: string;
  readonly verdict: Verdict;
  /** Timestamp when the incident was noticed/classified, epoch ms. */
  readonly atMs: number;
}

/**
 * Regulatory reporting windows the paid-tier reporters must hit:
 * - CERT-In s.70B(6) directions (Apr 2022): cyber incidents within 6h of notice
 * - RBI Master Directions on Fraud Risk Management (Jul 2024): FMR filing
 *   within 14 days of classifying an incident as fraud
 */
export const COMPLIANCE_WINDOWS = {
  certInReportMs: 6 * 60 * 60 * 1000,
  fmrReportMs: 14 * 24 * 60 * 60 * 1000,
} as const;

/** Deadline helpers shared by the open core and the paid reporters. */
export interface ComplianceHooks {
  /** Latest timestamp (epoch ms) by which CERT-In must be notified. */
  certInReportDeadlineMs(record: IncidentRecord): number;
  /** Latest timestamp by which the FMR portal filing is due. */
  fmrDeadlineMs(classifiedAtMs: number): number;
}

/**
 * Open-core stub: computes the regulatory deadlines and emits nothing.
 * The paid tier replaces this with the automated CERT-In / FMR reporters.
 */
export function complianceHooks(): ComplianceHooks {
  return {
    certInReportDeadlineMs: (record) => record.atMs + COMPLIANCE_WINDOWS.certInReportMs,
    fmrDeadlineMs: (classifiedAtMs) => classifiedAtMs + COMPLIANCE_WINDOWS.fmrReportMs,
  };
}
