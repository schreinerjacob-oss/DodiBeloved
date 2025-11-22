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
    if (!userId || !isOnline) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({
          type: 'register',
          data: { userId },
        }));

        if (isPaired) {
          ws.send(JSON.stringify({
            type: 'sync',
            data: {},
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          
          if (message.type === 'partner-joined' && !isPaired) {
            // Partner has joined, trigger a page reload to refresh context
            window.location.reload();
          }
        } catch (e) {
          console.log('WebSocket message parse error:', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
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
  }, [userId, isPaired, isOnline]);

  const send = (message: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return { connected, send, ws: wsRef.current };
}
