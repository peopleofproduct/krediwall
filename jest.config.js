// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/packages/core',
    '<rootDir>/packages/telemetry-rules',
    '<rootDir>/packages/dpi-adapters',
    '<rootDir>/packages/enterprise-proxy',
  ],
  coverageProvider: 'v8',
};
