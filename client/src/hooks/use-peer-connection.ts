import { useEffect, useRef, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';

interface PeerConnectionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  peer: RTCPeerConnection | null;
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
  
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const messageQueueRef = useRef<SyncMessage[]>([]);
  const messageHandlersRef = useRef<Map<string, (data: unknown) => void>>(new Map());

  const cleanupPeer = useCallback(() => {
    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch (e) {
        console.error('Error closing data channel:', e);
      }
      channelRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
      peerRef.current = null;
    }
    setState({ connected: false, connecting: false, error: null });
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (!channelRef.current || channelRef.current.readyState !== 'open') return;
    
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        try {
          channelRef.current.send(JSON.stringify(message));
        } catch (e) {
          console.error('Error sending queued message:', e);
        }
      }
    }
  }, []);

  const send = useCallback((message: SyncMessage) => {
    const fullMessage = { ...message, timestamp: Date.now() };
    
    if (channelRef.current && channelRef.current.readyState === 'open') {
      try {
        channelRef.current.send(JSON.stringify(fullMessage));
        console.log('P2P message sent:', message.type);
      } catch (e) {
        console.error('Error sending P2P message:', e);
        messageQueueRef.current.push(fullMessage);
      }
    } else {
      console.log('P2P not connected, queueing message:', message.type);
      messageQueueRef.current.push(fullMessage);
    }
  }, []);

  const setupChannelListeners = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel;

    channel.addEventListener('open', () => {
      console.log('Data channel opened');
      setState(prev => ({ ...prev, connected: true, connecting: false }));
      flushMessageQueue();
    });

    channel.addEventListener('close', () => {
      console.log('Data channel closed');
      setState({ connected: false, connecting: false, error: null });
    });

    channel.addEventListener('message', (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
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

    channel.addEventListener('error', (event) => {
      console.error('Data channel error:', event);
      setState(prev => ({ ...prev, error: 'Data channel error' }));
    });
  }, [flushMessageQueue]);

  // Create offer (initiator)
  const createOffer = useCallback(async (): Promise<string> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, error: null });
    
    return new Promise((resolve, reject) => {
      try {
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
          ]
        });
        
        peerRef.current = peerConnection;

        // Create data channel for initiator
        const dataChannel = peerConnection.createDataChannel('sync', { ordered: true });
        setupChannelListeners(dataChannel);

        peerConnection.addEventListener('icecandidate', (event) => {
          if (event.candidate) {
            console.log('ICE candidate:', event.candidate);
          }
        });

        peerConnection.addEventListener('error', (event) => {
          console.error('RTCPeerConnection error:', event);
          reject(new Error('RTCPeerConnection error'));
        });

        peerConnection.onconnectionstatechange = () => {
          console.log('Connection state:', peerConnection.connectionState);
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            reject(new Error('Connection failed'));
          }
        };

        // Create offer
        peerConnection.createOffer()
          .then(offer => {
            console.log('Offer created');
            return peerConnection.setLocalDescription(offer);
          })
          .then(() => {
            const offerData = {
              type: 'offer',
              sdp: peerConnection.localDescription?.sdp,
            };
            const offerString = btoa(JSON.stringify(offerData));
            console.log('Offer signal generated');
            resolve(offerString);
          })
          .catch(e => {
            console.error('Error creating offer:', e);
            reject(e);
          });
      } catch (e) {
        console.error('Exception in createOffer:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        reject(e);
      }
    });
  }, [cleanupPeer, setupChannelListeners]);

  // Accept offer and create answer (joiner)
  const acceptOffer = useCallback(async (offerString: string): Promise<string> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, error: null });
    
    return new Promise((resolve, reject) => {
      try {
        const offerData = JSON.parse(atob(offerString));
        
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
          ]
        });
        
        peerRef.current = peerConnection;

        // Handle incoming data channel
        peerConnection.ondatachannel = (event) => {
          console.log('Data channel received');
          setupChannelListeners(event.channel);
        };

        peerConnection.addEventListener('icecandidate', (event) => {
          if (event.candidate) {
            console.log('ICE candidate:', event.candidate);
          }
        });

        peerConnection.addEventListener('error', (event) => {
          console.error('RTCPeerConnection error:', event);
          reject(new Error('RTCPeerConnection error'));
        });

        peerConnection.onconnectionstatechange = () => {
          console.log('Connection state:', peerConnection.connectionState);
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            reject(new Error('Connection failed'));
          }
        };

        // Set remote description and create answer
        peerConnection.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: offerData.sdp,
        }))
          .then(() => peerConnection.createAnswer())
          .then(answer => {
            console.log('Answer created');
            return peerConnection.setLocalDescription(answer);
          })
          .then(() => {
            const answerData = {
              type: 'answer',
              sdp: peerConnection.localDescription?.sdp,
            };
            const answerString = btoa(JSON.stringify(answerData));
            console.log('Answer signal generated');
            resolve(answerString);
          })
          .catch(e => {
            console.error('Error accepting offer:', e);
            reject(e);
          });
      } catch (e) {
        console.error('Exception in acceptOffer:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        reject(e);
      }
    });
  }, [cleanupPeer, setupChannelListeners]);

  // Complete connection (initiator receives answer)
  const completeConnection = useCallback((answerString: string) => {
    if (!peerRef.current) {
      console.error('No peer instance to complete connection');
      return;
    }
    
    try {
      const answerData = JSON.parse(atob(answerString));
      peerRef.current.setRemoteDescription(new RTCSessionDescription({
        type: 'answer',
        sdp: answerData.sdp,
      }));
      console.log('Answer received and set');
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
