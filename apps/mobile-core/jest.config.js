module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  moduleNameMapper: {
    '^@galatura/api-client-ts$': '<rootDir>/../../packages/api-client-ts/src/index.ts',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { configFile: './babel.config.js' }],
  },
};
