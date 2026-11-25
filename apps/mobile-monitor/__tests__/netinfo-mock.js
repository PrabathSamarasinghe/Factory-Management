module.exports = {
  useNetInfo: () => ({ isConnected: true }),
  addEventListener: handler => {
    handler({ isConnected: true });
    return () => undefined;
  },
};
