import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

// The app code uses browser globals (window, crypto.subtle, atob/btoa, localStorage, indexedDB).
// For unit tests we polyfill the minimum surface needed.

if (typeof (globalThis as any).btoa !== 'function') {
  (globalThis as any).btoa = (bin: string) => Buffer.from(bin, 'binary').toString('base64');
}
if (typeof (globalThis as any).atob !== 'function') {
  (globalThis as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
}

if (typeof (globalThis as any).localStorage !== 'object') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

if (typeof (globalThis as any).navigator !== 'object') {
  (globalThis as any).navigator = {};
}
if (typeof (globalThis as any).navigator.storage !== 'object') {
  (globalThis as any).navigator.storage = {};
}
if (typeof (globalThis as any).navigator.storage.persist !== 'function') {
  (globalThis as any).navigator.storage.persist = async () => false;
}

// Provide a minimal `window` object for app code that uses `window.crypto`.
if (typeof (globalThis as any).window !== 'object') {
  (globalThis as any).window = {};
}
(globalThis as any).window.crypto = webcrypto as any;
(globalThis as any).window.localStorage = (globalThis as any).localStorage;
(globalThis as any).window.navigator = (globalThis as any).navigator;
(globalThis as any).window.location = (globalThis as any).window.location ?? { search: '' };

