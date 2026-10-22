/** @type {import('jest').Config} */
module.exports = {
  displayName: 'enterprise-proxy',
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
