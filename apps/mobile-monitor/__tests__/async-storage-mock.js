const store = new Map();
module.exports = {
  setItem: async (k, v) => {
    store.set(k, v);
  },
  getItem: async k => (store.has(k) ? store.get(k) : null),
  removeItem: async k => {
    store.delete(k);
  },
  clear: async () => {
    store.clear();
  },
};
