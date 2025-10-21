module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/setup.js'],
  testMatch: [
    '<rootDir>/**/*.test.js'
  ],
  testTimeout: 10000,
  clearMocks: true,
  collectCoverage: false,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true
};