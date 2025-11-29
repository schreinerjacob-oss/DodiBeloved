import { useEffect, useCallback, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from './use-peer-connection';

interface WSMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const { isPaired } = useDodi();
  const { send: sendP2P, state: peerState } = usePeerConnection();
  const messageHandlersRef = useRef<((event: MessageEvent) => void)[]>([]);

  const send = useCallback((message: WSMessage) => {
    console.log('Sending via P2P:', message.type, 'Connected:', peerState.connected);

    // Send via P2P connection
    sendP2P({
      type: message.type,
      data: message.data,
      timestamp: Date.now(),
    });

    // Log if message is being queued (not connected)
    if (!peerState.connected) {
      console.warn('P2P not connected - message will be queued');
    }
  }, [sendP2P, peerState.connected]);

  // Simulate WebSocket object for backward compatibility
  const wsObject = {
    readyState: peerState.connected ? 1 : 3, // OPEN : CLOSED
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

  // Listen for incoming P2P messages and dispatch as events
  useEffect(() => {
    const handleP2pMessage = (event: CustomEvent) => {
      const message = event.detail;
      console.log('WebSocket received P2P message:', message.type);
      const messageEvent = { data: JSON.stringify(message) } as MessageEvent;
      messageHandlersRef.current.forEach(handler => handler(messageEvent));
    };

    window.addEventListener('p2p-message', handleP2pMessage as EventListener);
    return () => {
      window.removeEventListener('p2p-message', handleP2pMessage as EventListener);
    };
  }, []);

  return {
    connected: peerState.connected,
    send,
    ws: wsObject as unknown as WebSocket,
  };
}
