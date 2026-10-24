/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@belzo/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/dist/'],
  // Async screen tests (TanStack Query + debounce timers) can leave a batch
  // timer pending after teardown; force a clean exit so runs are deterministic.
  forceExit: true,
};
