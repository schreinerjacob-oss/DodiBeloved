import { useEffect, useRef, useState, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import type { SyncMessage } from '@/types';
import {
  generateEphemeralKeyPair,
  deriveSharedSecret,
  createTunnelInitMessage,
  createTunnelKeyMessage,
  createTunnelAckMessage,
  extractMasterKeyPayload,
  generateMasterKey,
  generateMasterSalt,
  type EphemeralKeyPair,
  type TunnelMessage,
  type MasterKeyPayload,
} from '@/lib/tunnel-handshake';
import type { DataConnection } from 'peerjs';

interface PeerConnectionState {
  connected: boolean;
  connecting: boolean;
  tunnelEstablished: boolean;
  error: string | null;
}

interface UsePeerConnectionReturn {
  state: PeerConnectionState;
  send: (message: SyncMessage) => void;
  peer: RTCPeerConnection | null;
  createOffer: () => Promise<string>;
  acceptOffer: (offer: string, peerPublicKey: string) => Promise<{ answer: string; publicKey: string; fingerprint: string }>;
  completeConnection: (answer: string, peerPublicKey: string) => void;
  disconnect: () => void;
  ephemeralKeyPair: EphemeralKeyPair | null;
  onTunnelComplete: ((payload: MasterKeyPayload) => void) | null;
  setOnTunnelComplete: (cb: (payload: MasterKeyPayload) => void) => void;
}

export function usePeerConnection(): UsePeerConnectionReturn {
  const { userId } = useDodi();
  const [state, setState] = useState<PeerConnectionState>({
    connected: false,
    connecting: false,
    tunnelEstablished: false,
    error: null,
  });
  
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const messageQueueRef = useRef<SyncMessage[]>([]);
  const ephemeralKeyPairRef = useRef<EphemeralKeyPair | null>(null);
  const peerPublicKeyRef = useRef<string | null>(null);
  const sharedSecretRef = useRef<CryptoKey | null>(null);
  const isCreatorRef = useRef<boolean>(false);
  const tunnelCompleteCallbackRef = useRef<((payload: MasterKeyPayload) => void) | null>(null);

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
    ephemeralKeyPairRef.current = null;
    peerPublicKeyRef.current = null;
    sharedSecretRef.current = null;
    setState({ connected: false, connecting: false, tunnelEstablished: false, error: null });
  }, []);

  const flushMessageQueue = useCallback(() => {
    if (!channelRef.current || channelRef.current.readyState !== 'open') {
      console.log('Cannot flush - channel not ready');
      return;
    }
    
    const queuedCount = messageQueueRef.current.length;
    if (queuedCount === 0) {
      console.log('No queued messages to flush');
      return;
    }
    
    console.log('Flushing', queuedCount, 'queued messages');
    let sentCount = 0;
    
    while (messageQueueRef.current.length > 0) {
      const message = messageQueueRef.current.shift();
      if (message) {
        try {
          channelRef.current.send(JSON.stringify(message));
          sentCount++;
        } catch (e) {
          console.error('Error sending queued message:', e);
          // Re-queue if failed
          messageQueueRef.current.unshift(message);
          break;
        }
      }
    }
    
    console.log('Flushed', sentCount, 'messages, remaining queue:', messageQueueRef.current.length);
  }, []);

  const send = useCallback((message: SyncMessage) => {
    const fullMessage = { ...message, timestamp: Date.now(), id: `${Date.now()}-${Math.random()}` };
    
    if (channelRef.current && channelRef.current.readyState === 'open' && state.tunnelEstablished) {
      try {
        channelRef.current.send(JSON.stringify(fullMessage));
        console.log('P2P message sent:', message.type, fullMessage.id);
      } catch (e) {
        console.error('Error sending P2P message:', e);
        messageQueueRef.current.push(fullMessage);
      }
    } else {
      console.log('P2P not ready, queueing message:', message.type, 'Queue length:', messageQueueRef.current.length);
      messageQueueRef.current.push(fullMessage);
    }
  }, [state.tunnelEstablished]);

  const sendTunnelMessage = useCallback((message: TunnelMessage) => {
    if (channelRef.current && channelRef.current.readyState === 'open') {
      try {
        channelRef.current.send(JSON.stringify({ __tunnel: true, ...message }));
        console.log('Tunnel message sent:', message.type);
      } catch (e) {
        console.error('Error sending tunnel message:', e);
      }
    }
  }, []);

  const handleTunnelMessage = useCallback(async (message: TunnelMessage) => {
    console.log('Tunnel message received:', message.type);

    if (message.type === 'tunnel-init' && message.publicKey && !isCreatorRef.current) {
      // Joiner receiving creator's tunnel-init
      peerPublicKeyRef.current = message.publicKey;
      
      if (ephemeralKeyPairRef.current) {
        const sharedSecret = await deriveSharedSecret(
          ephemeralKeyPairRef.current.privateKey,
          message.publicKey
        );
        sharedSecretRef.current = sharedSecret;
        console.log('Shared secret derived (joiner side)');

        const initResponse = createTunnelInitMessage(
          ephemeralKeyPairRef.current.publicKey
        );
        sendTunnelMessage(initResponse);
      }
    }

    if (message.type === 'tunnel-init' && isCreatorRef.current && message.publicKey) {
      peerPublicKeyRef.current = message.publicKey;
      
      if (ephemeralKeyPairRef.current) {
        const sharedSecret = await deriveSharedSecret(
          ephemeralKeyPairRef.current.privateKey,
          message.publicKey
        );
        sharedSecretRef.current = sharedSecret;
        console.log('Shared secret derived (creator side)');

        const masterKey = generateMasterKey();
        const salt = generateMasterSalt();
        
        const payload: MasterKeyPayload = {
          masterKey,
          salt,
          creatorId: userId || '',
        };

        const keyMessage = await createTunnelKeyMessage(payload, sharedSecret);
        sendTunnelMessage(keyMessage);
        
        if (tunnelCompleteCallbackRef.current) {
          tunnelCompleteCallbackRef.current(payload);
        }
      }
    }

    if (message.type === 'tunnel-key' && sharedSecretRef.current) {
      const payload = await extractMasterKeyPayload(message, sharedSecretRef.current);
      
      if (payload) {
        console.log('Master key received from creator');
        
        const ackMessage = createTunnelAckMessage();
        sendTunnelMessage(ackMessage);
        
        setState(prev => ({ ...prev, tunnelEstablished: true }));
        
        if (tunnelCompleteCallbackRef.current) {
          tunnelCompleteCallbackRef.current(payload);
        }
        
        // Flush after setting state
        setTimeout(() => flushMessageQueue(), 10);
      }
    }

    if (message.type === 'tunnel-ack') {
      console.log('Tunnel ACK received - connection fully established. Queue size:', messageQueueRef.current.length);
      setState(prev => ({ ...prev, tunnelEstablished: true }));
      // Flush immediately
      flushMessageQueue();
    }
  }, [userId, sendTunnelMessage, flushMessageQueue]);

  const setupChannelListeners = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel;

    channel.addEventListener('open', async () => {
      console.log('Data channel opened, queued messages:', messageQueueRef.current.length);
      setState(prev => ({ ...prev, connected: true, connecting: false }));
      
      if (isCreatorRef.current && ephemeralKeyPairRef.current) {
        const initMessage = createTunnelInitMessage(
          ephemeralKeyPairRef.current.publicKey
        );
        sendTunnelMessage(initMessage);
      }
    });

    channel.addEventListener('close', () => {
      console.log('Data channel closed');
      setState({ connected: false, connecting: false, tunnelEstablished: false, error: null });
    });

    channel.addEventListener('message', async (event) => {
      try {
        const parsed = JSON.parse(event.data);
        
        if (parsed.__tunnel) {
          const { __tunnel, ...tunnelMessage } = parsed;
          await handleTunnelMessage(tunnelMessage as TunnelMessage);
          return;
        }
        
        const message: SyncMessage = parsed;
        console.log('P2P received:', message.type);
        
        window.dispatchEvent(new CustomEvent('p2p-message', { detail: message }));
      } catch (e) {
        console.error('Error parsing P2P message:', e);
      }
    });

    channel.addEventListener('error', (event) => {
      console.error('Data channel error:', event);
      setState(prev => ({ ...prev, error: 'Data channel error' }));
    });
  }, [handleTunnelMessage, sendTunnelMessage]);

  const createOffer = useCallback(async (): Promise<string> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, tunnelEstablished: false, error: null });
    isCreatorRef.current = true;
    
    const ephemeralKeyPair = await generateEphemeralKeyPair();
    ephemeralKeyPairRef.current = ephemeralKeyPair;
    
    return new Promise((resolve, reject) => {
      try {
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
          ]
        });
        
        peerRef.current = peerConnection;

        const dataChannel = peerConnection.createDataChannel('dodi-tunnel', { ordered: true });
        setupChannelListeners(dataChannel);

        peerConnection.addEventListener('icecandidate', () => {});

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

        const onIceGatheringStateChange = () => {
          if (peerConnection.iceGatheringState === 'complete') {
            console.log('ICE gathering complete');
            peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
            
            const offerData = {
              type: 'offer',
              sdp: peerConnection.localDescription?.sdp,
            };
            const offerString = btoa(JSON.stringify(offerData));
            resolve(offerString);
          }
        };

        peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange);

        peerConnection.createOffer()
          .then(offer => peerConnection.setLocalDescription(offer))
          .then(() => {
            if (peerConnection.iceGatheringState === 'complete') {
              onIceGatheringStateChange();
            }
          })
          .catch(e => {
            peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
            reject(e);
          });
      } catch (e) {
        reject(e);
      }
    });
  }, [cleanupPeer, setupChannelListeners]);

  const acceptOffer = useCallback(async (
    offerString: string,
    peerPublicKey: string
  ): Promise<{ answer: string; publicKey: string; fingerprint: string }> => {
    cleanupPeer();
    setState({ connected: false, connecting: true, tunnelEstablished: false, error: null });
    isCreatorRef.current = false;
    
    const ephemeralKeyPair = await generateEphemeralKeyPair();
    ephemeralKeyPairRef.current = ephemeralKeyPair;
    peerPublicKeyRef.current = peerPublicKey;
    
    return new Promise((resolve, reject) => {
      try {
        const offerData = JSON.parse(atob(offerString));
        
        const peerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
          ]
        });
        
        peerRef.current = peerConnection;

        peerConnection.ondatachannel = (event) => {
          console.log('Data channel received');
          setupChannelListeners(event.channel);
        };

        peerConnection.addEventListener('icecandidate', () => {});

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

        const onIceGatheringStateChange = () => {
          if (peerConnection.iceGatheringState === 'complete') {
            console.log('ICE gathering complete');
            peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
            
            const answerData = {
              type: 'answer',
              sdp: peerConnection.localDescription?.sdp,
            };
            const answerString = btoa(JSON.stringify(answerData));
            resolve({
              answer: answerString,
              publicKey: ephemeralKeyPair.publicKey,
              fingerprint: ephemeralKeyPair.fingerprint,
            });
          }
        };

        peerConnection.addEventListener('icegatheringstatechange', onIceGatheringStateChange);

        peerConnection.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: offerData.sdp,
        }))
          .then(() => peerConnection.createAnswer())
          .then(answer => peerConnection.setLocalDescription(answer))
          .then(() => {
            if (peerConnection.iceGatheringState === 'complete') {
              onIceGatheringStateChange();
            }
          })
          .catch(e => {
            peerConnection.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
            reject(e);
          });
      } catch (e) {
        reject(e);
      }
    });
  }, [cleanupPeer, setupChannelListeners]);

  const completeConnection = useCallback((answerString: string, peerPublicKey: string) => {
    if (!peerRef.current) {
      console.error('No peer instance to complete connection');
      return;
    }
    
    peerPublicKeyRef.current = peerPublicKey;
    
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

  const setOnTunnelComplete = useCallback((cb: (payload: MasterKeyPayload) => void) => {
    tunnelCompleteCallbackRef.current = cb;
  }, []);

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
    ephemeralKeyPair: ephemeralKeyPairRef.current,
    onTunnelComplete: tunnelCompleteCallbackRef.current,
    setOnTunnelComplete,
  };
}

export function registerMessageHandler(type: string, handler: (data: unknown) => void): () => void {
  const handlers = (window as unknown as { __p2pHandlers?: Map<string, (data: unknown) => void> }).__p2pHandlers || new Map();
  handlers.set(type, handler);
  (window as unknown as { __p2pHandlers: Map<string, (data: unknown) => void> }).__p2pHandlers = handlers;
  
  return () => {
    handlers.delete(type);
  };
}
