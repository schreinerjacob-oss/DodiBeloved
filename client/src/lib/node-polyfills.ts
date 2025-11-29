// Polyfills for Node.js modules required by simple-peer in browser environment

// EventEmitter polyfill
class EventEmitter {
  private listeners: Map<string, Set<Function>> = new Map();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  once(event: string, listener: Function): this {
    const wrapper = (...args: any[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Function): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  removeListener(event: string, listener: Function): this {
    return this.off(event, listener);
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.listeners.get(event);
    if (!listeners) return false;
    listeners.forEach(listener => listener(...args));
    return listeners.size > 0;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

// Util polyfill
const debuglog = (section: string) => {
  return () => {};
};

// Make polyfills global-ish by storing them where needed
(globalThis as any).EventEmitter = EventEmitter;
(globalThis as any).debuglog = debuglog;
