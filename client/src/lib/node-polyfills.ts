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
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(listener);
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach(listener => {
        try {
          listener(...args);
        } catch (e) {
          console.error('EventEmitter listener error:', e);
        }
      });
      return true;
    }
    return false;
  }

  removeListener(event: string, listener: Function): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

// Utility polyfills
const util = {
  inherits: (ctor: any, superCtor: any) => {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: { value: ctor, enumerable: false, writable: true, configurable: true },
    });
  },
  debuglog: (name: string) => (...args: any[]) => {
    console.debug(`[${name}]`, ...args);
  },
  inspect: (obj: any) => String(obj),
};

// Stream polyfill basics
const stream = {
  EventEmitter,
  Readable: EventEmitter,
  Writable: EventEmitter,
  Duplex: EventEmitter,
  Transform: EventEmitter,
};

// Inject into global scope so require/import inside simple-peer can find them
(globalThis as any).EventEmitter = EventEmitter;

// Override require for stream modules if needed
if (typeof (global as any) !== 'undefined') {
  (global as any).EventEmitter = EventEmitter;
}

export { EventEmitter, util, stream };
