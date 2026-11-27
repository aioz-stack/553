/**
 * App-wide signals (the web app used window events): a screen says "my balance changed" or the
 * API says "you were signed out" and every listener reacts.
 */
type Payloads = {
  wallet: undefined;
  disconnected: { title: string; message: string };
  maintenance: unknown;
};

type Listener<K extends keyof Payloads> = (payload: Payloads[K]) => void;

const listeners: { [K in keyof Payloads]?: Set<Listener<K>> } = {};

export function on<K extends keyof Payloads>(name: K, fn: Listener<K>): () => void {
  const set = ((listeners as Record<string, Set<unknown>>)[name] ??= new Set()) as Set<Listener<K>>;
  set.add(fn);
  return () => set.delete(fn);
}

export function emit<K extends keyof Payloads>(name: K, ...[payload]: Payloads[K] extends undefined ? [] : [Payloads[K]]): void {
  (listeners[name] as Set<Listener<K>> | undefined)?.forEach((fn) => fn(payload as Payloads[K]));
}

/** Tell every balance display to reload (Gold, Chips or Keys changed on the server). */
export const walletChanged = () => emit('wallet');
