import { useEffect, useRef, useState, useCallback } from 'react';
import '@/lib/node-polyfills'; // Load polyfills before SimplePeer
import { useDodi } from '@/contexts/DodiContext';
import SimplePeer from 'simple-peer';
import type { SyncMessage } from '@/types';

interface PeerConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  peer: SimplePeer.Instance | null;
  createOffer: () => Promise<string>;
  acceptOffer: (offer: string) => Promise<string>;
  completeConnection: (answer: string) => void;
  disconnect: () => void;
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId, partnerId, pairingStatus } = useDodi();
  const [state, setState] = useState<PeerConnectionState>({
    connected: false,
    connecting: false,
    error: null,
  });
  
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const messageQueueRef = useRef<SyncMessage[]>([]);
  const messageHandlersRef = useRef<Map<string, (data: unknown) => void>>(new Map());

  const cleanupPeer = useCallback(() => {
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch (e) {
        console.error('Error destroying peer:', e);
      }
      peerRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (!peerRef.current || !state.connected) return;
    
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        try {
          peerRef.current.send(JSON.stringify(message));
        } catch (e) {
          console.error('Error sending queued message:', e);
        }
      }
    }
  }, [state.connected]);

  const send = useCallback((message: SyncMessage) => {
    const fullMessage = { ...message, timestamp: Date.now() };
    
    if (peerRef.current && state.connected) {
      try {
        peerRef.current.send(JSON.stringify(fullMessage));
        console.log('P2P message sent:', message.type);
      } catch (e) {
        console.error('Error sending P2P message:', e);
        messageQueueRef.current.push(fullMessage);
      }
    } else {
      console.log('P2P not connected, queueing message:', message.type);
      messageQueueRef.current.push(fullMessage);
    }
  }, [state.connected]);

  const setupPeerListeners = useCallback((peer: SimplePeer.Instance) => {
    peer.on('connect', () => {
      console.log('P2P connected!');
      setState({ connected: true, connecting: false, error: null });
      flushMessageQueue();
    });

    peer.on('data', (data: Uint8Array) => {
      try {
        const message: SyncMessage = JSON.parse(data.toString());
        console.log('P2P received:', message.type);
        
        // Dispatch to registered handlers
        const handler = messageHandlersRef.current.get(message.type);
        if (handler) {
          handler(message.data);
        }
        
        // Also dispatch a custom event for components to listen to
        window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
      } catch (e) {
        console.error('Error parsing P2P message:', e);
      }
    });

    peer.on('error', (err) => {
      console.error('P2P error:', err);
      setState(prev => ({ ...prev, error: err.message }));
    });

    peer.on('close', () => {
      console.log('P2P connection closed');
      setState({ connected: false, connecting: false, error: null });
    });
  }, [flushMessageQueue]);

  // Create offer (initiator)
  const createOffer = useCallback(async (): Promise<string> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, error: null });
    
    return new Promise((resolve, reject) => {
      try {
        const peer = new SimplePeer({
          initiator: true,
          trickle: false,
        });
        
        peerRef.current = peer;
        setupPeerListeners(peer);

        peer.on('signal', (data) => {
          console.log('Offer signal generated');
          const offerString = btoa(JSON.stringify(data));
          resolve(offerString);
        });

        peer.on('error', (err) => {
          console.error('SimplePeer error in createOffer:', {
            message: (err as any).message,
            code: (err as any).code,
            stack: (err as any).stack,
            toString: err.toString(),
          });
          reject(err);
        });
      } catch (e) {
        console.error('Exception in createOffer:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        reject(e);
      }
    });
  }, [cleanupPeer, setupPeerListeners]);

  // Accept offer and create answer (joiner)
  const acceptOffer = useCallback(async (offerString: string): Promise<string> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, error: null });
    
    return new Promise((resolve, reject) => {
      try {
        const offerData = JSON.parse(atob(offerString));
        const peer = new SimplePeer({
          initiator: false,
          trickle: false,
        });
        
        peerRef.current = peer;
        setupPeerListeners(peer);

        let signalCount = 0;
        peer.on('signal', (data) => {
          signalCount++;
          // Wait for answer signal (not offer/renegotiate)
          if (signalCount === 1 && data.type === 'answer') {
            console.log('Answer signal generated');
            const answerString = btoa(JSON.stringify(data));
            resolve(answerString);
          }
        });

        peer.on('error', (err) => {
          console.error('SimplePeer error in acceptOffer:', {
            message: (err as any).message,
            code: (err as any).code,
            stack: (err as any).stack,
          });
          reject(err);
        });

        // Signal with the offer to generate answer
        peer.signal(offerData);
      } catch (e) {
        console.error('Exception in acceptOffer:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        reject(e);
      }
    });
  }, [cleanupPeer, setupPeerListeners]);

  // Complete connection (initiator receives answer)
  const completeConnection = useCallback((answerString: string) => {
    if (!peerRef.current) {
      console.error('No peer instance to complete connection');
      return;
    }
    
    try {
      const answerData = JSON.parse(atob(answerString));
      peerRef.current.signal(answerData);
      console.log('Answer signal processed');
    } catch (e) {
      console.error('Error completing connection:', e);
      setState(prev => ({ ...prev, error: 'Invalid answer signal' }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPeer();
    };
  }, [cleanupPeer]);

  return {
    state,
    send,
    peer: peerRef.current,
    createOffer,
    acceptOffer,
    completeConnection,
    disconnect: cleanupPeer,
  };
}

// Global message handler registration
export function registerMessageHandler(type: string, handler: (data: unknown) => void): () => void {
  const handlers = (window as unknown as { __p2pHandlers?: Map<string, (data: unknown) => void> }).__p2pHandlers || new Map();
  handlers.set(type, handler);
  (window as unknown as { __p2pHandlers: Map<string, (data: unknown) => void> }).__p2pHandlers = handlers;
  
  return () => {
    handlers.delete(type);
  };
}
