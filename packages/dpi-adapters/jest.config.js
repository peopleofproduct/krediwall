/** @type {import('jest').Config} */
module.exports = {
  displayName: 'dpi-adapters',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  moduleNameMapper: {
    '^@vayu/(.*)$': '<rootDir>/../$1/src',
  },
};
