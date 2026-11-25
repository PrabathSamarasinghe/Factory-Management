const mockKeychainStore = new Map();

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  },
  setGenericPassword: jest.fn(async (_username, password, options) => {
    mockKeychainStore.set(options.service, password);
    return { service: options.service, storage: 'mock' };
  }),
  getGenericPassword: jest.fn(async options => {
    const password = mockKeychainStore.get(options.service);
    return password
      ? {
          username: 'mock',
          password,
          service: options.service,
          storage: 'mock',
        }
      : false;
  }),
  resetGenericPassword: jest.fn(async options => {
    mockKeychainStore.delete(options.service);
    return true;
  }),
  __store: mockKeychainStore,
}));

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: () => ({ isConnected: true }),
  addEventListener: handler => {
    handler({ isConnected: true });
    return () => undefined;
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = jest.fn(() =>
  Promise.reject(new Error('fetch mock is not configured')),
);
