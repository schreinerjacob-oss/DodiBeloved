import { useEffect, useState, useCallback, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';

interface WSMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const { userId, partnerId, isPaired } = useDodi();
  const [connected, setConnected] = useState(false);
  const messageHandlersRef = useRef<((event: MessageEvent) => void)[]>([]);
  
  // Since we're now a pure P2P app, WebSocket is replaced with event-based messaging
  // This stub maintains API compatibility while pages migrate to P2P
  
  const send = useCallback((message: WSMessage) => {
    console.log('P2P send (stub):', message.type, message.data);
    
    // Dispatch as custom event for local components
    window.dispatchEvent(new CustomEvent('dodi-sync', { 
      detail: { type: message.type, data: message.data }
    }));
  }, []);

  // Simulate WebSocket object for backward compatibility
  const wsObject = {
    readyState: isPaired ? 1 : 3, // OPEN : CLOSED
    addEventListener: (type: string, handler: (event: MessageEvent) => void) => {
      if (type === 'message') {
        messageHandlersRef.current.push(handler);
      }
    },
    removeEventListener: (type: string, handler: (event: MessageEvent) => void) => {
      if (type === 'message') {
        messageHandlersRef.current = messageHandlersRef.current.filter(h => h !== handler);
      }
    },
    send: (data: string) => {
      try {
        const parsed = JSON.parse(data);
        send(parsed);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    },
  };

  useEffect(() => {
    if (isPaired) {
      setConnected(true);
    }
  }, [isPaired]);

  // Listen for incoming sync events
  useEffect(() => {
    const handleSyncEvent = (event: CustomEvent) => {
      const messageEvent = { data: JSON.stringify(event.detail) } as MessageEvent;
      messageHandlersRef.current.forEach(handler => handler(messageEvent));
    };

    window.addEventListener('dodi-sync', handleSyncEvent as EventListener);
    return () => {
      window.removeEventListener('dodi-sync', handleSyncEvent as EventListener);
    };
  }, []);

  return { 
    connected: isPaired, 
    send, 
    ws: wsObject as unknown as WebSocket 
  };
}
