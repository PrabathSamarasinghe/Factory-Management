module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  moduleNameMapper: {
    '^@galatura/mobile-core$': '<rootDir>/../mobile-core/src/index.ts',
    '^@galatura/api-client-ts$': '<rootDir>/../../packages/api-client-ts/src/index.ts',
    '^react-native$': '<rootDir>/__tests__/react-native-mock.js',
    '^react-native-keychain$': '<rootDir>/__tests__/keychain-mock.js',
    '^react-native-safe-area-context$': '<rootDir>/__tests__/safe-area-mock.js',
    '^@react-native-community/netinfo$': '<rootDir>/__tests__/netinfo-mock.js',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/__tests__/async-storage-mock.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      { configFile: './babel.config.js' },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-native-community|@galatura/mobile-core|\\.pnpm)/)',
  ],
};
