import { useState, useEffect } from 'react';
import { getOfflineQueueSize } from '@/lib/storage';

const queueListeners = new Set<(size: number) => void>();
let currentQueueSize = 0;

export function notifyQueueListeners(size: number) {
  currentQueueSize = size;
  queueListeners.forEach(listener => listener(size));
}

export function useOfflineQueueSize(): number {
  const [queueSize, setQueueSize] = useState(currentQueueSize);

  useEffect(() => {
    queueListeners.add(setQueueSize);
    
    getOfflineQueueSize().then(size => {
      setQueueSize(size);
      currentQueueSize = size;
    });

    return () => {
      queueListeners.delete(setQueueSize);
    };
  }, []);

  return queueSize;
}
