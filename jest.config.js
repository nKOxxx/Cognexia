module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'crypto.js',
    'index.js',
    'memory-graph.js',
    'import-export.js',
    'agent-collaboration.js',
    'memory-templates.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testTimeout: 15000,
};
