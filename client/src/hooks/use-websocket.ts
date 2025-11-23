import { useEffect, useRef, useState } from 'react';
import { useDodi } from '@/contexts/DodiContext';

interface WSMessage {
  type: string;
  data: any;
}

export function useWebSocket() {
  const { userId, partnerId, isPaired, isOnline } = useDodi();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Connect for unpaired users waiting for partner, or paired users
    if (!userId) {
      console.log('WebSocket: No userId yet');
      return;
    }

    const connect = () => {
      console.log('WebSocket: Attempting to connect for userId:', userId);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket: Connected');
        setConnected(true);
        ws.send(JSON.stringify({
          type: 'register',
          data: { userId },
        }));

        if (isPaired) {
          console.log('WebSocket: Sending sync request for paired user');
          ws.send(JSON.stringify({
            type: 'sync',
            data: {},
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          console.log('WebSocket received:', message.type, message.data);
          
          if (message.type === 'partner-joined' && !isPaired) {
            console.log('WebSocket: Partner joined, reloading');
            // Partner has joined, trigger a page reload to refresh context
            window.location.reload();
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e, 'Raw data:', event.data);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket: Disconnected, reconnecting in 3s');
        setConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, isPaired]);

  const send = (message: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        console.log('WebSocket message sent:', message.type);
      } catch (error) {
        console.error('WebSocket send error:', error);
      }
    } else {
      console.warn('WebSocket not ready. State:', wsRef.current?.readyState, 'Connected:', connected);
    }
  };

  return { connected, send, ws: wsRef.current };
}
