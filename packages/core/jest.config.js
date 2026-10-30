// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Kapil — People of Product

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'core',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@krediwall/(.*)$': '<rootDir>/../$1/src',
  },
};
