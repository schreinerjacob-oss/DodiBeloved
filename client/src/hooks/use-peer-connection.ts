import { useEffect, useRef, useState, useCallback } from 'react';
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
          reject(err);
        });
      } catch (e) {
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
        const offer = JSON.parse(atob(offerString));
        
        const peer = new SimplePeer({
          initiator: false,
          trickle: false,
        });
        
        peerRef.current = peer;
        setupPeerListeners(peer);

        peer.on('signal', (data) => {
          console.log('Answer signal generated');
          const answerString = btoa(JSON.stringify(data));
          resolve(answerString);
        });

        peer.on('error', (err) => {
          reject(err);
        });

        peer.signal(offer);
      } catch (e) {
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
      const answer = JSON.parse(atob(answerString));
      peerRef.current.signal(answer);
    } catch (e) {
      console.error('Error completing connection:', e);
      setState(prev => ({ ...prev, error: 'Invalid answer signal' }));
    }
  }, []);

  // Try to reconnect using stored signal data
  useEffect(() => {
    if (pairingStatus !== 'connected' || !partnerId) return;
    
    // Check for stored peer signal from pairing
    const storedSignal = localStorage.getItem('dodi-peer-signal');
    const storedRole = localStorage.getItem('dodi-peer-role');
    
    if (storedSignal && storedRole) {
      try {
        if (storedRole === 'initiator') {
          // We created the offer, wait for partner to connect
          console.log('Waiting for partner to connect...');
        } else {
          // We joined, try to reconnect
          console.log('Attempting to reconnect to partner...');
        }
      } catch (e) {
        console.error('Error reconnecting:', e);
      }
    }
  }, [pairingStatus, partnerId]);

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
