type Listener = () => void;
const listeners = new Set<Listener>();

export function emitRefresh(): void {
  listeners.forEach(l => l());
}

export function onRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
