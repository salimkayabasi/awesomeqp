module.exports = {
  testURL: 'http://localhost/',
  setupFiles: ['<rootDir>/tests/setup.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.{js,jsx}',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/coverage/**',
    '!bin/**',
    '!tests/**',
    '!jest.config.js',
    '!**/index.js',
  ],
  testMatch: ['<rootDir>/tests/**/*.test.js?(x)'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
