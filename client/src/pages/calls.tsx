import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Wifi, WifiOff, Volume2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SimplePeer from 'simple-peer';
import { AudioEncoder, AudioDecoder, arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/audio-codec';

export default function CallsPage() {
  const { userId, partnerId } = useDodi();
  const { state: peerState, send: sendP2P } = usePeerConnection();
  const { toast } = useToast();
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const [incomingCallType, setIncomingCallType] = useState<'audio' | 'video' | null>(null);
  const [hasOfferSignal, setHasOfferSignal] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'searching'>('searching');
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorsRef = useRef<OscillatorNode[]>([]);
  const mediaCallRef = useRef<SimplePeer.Instance | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const speakerOnRef = useRef(true);
  const audioOutputDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const audioDecoderRef = useRef<AudioDecoder | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const acceptFromPendingInProgressRef = useRef(false);
  const acceptCallFromPendingRef = useRef<(callType: 'audio' | 'video') => Promise<void>>(() => Promise.resolve());
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Call quality monitoring
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callActive && mediaCallRef.current) {
      interval = setInterval(async () => {
        const peer = mediaCallRef.current as any;
        if (!peer?._pc) return;
        try {
          const stats = await peer._pc.getStats();
          let rtt = 0;
          let packetLoss = 0;

          stats.forEach((report: any) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = report.currentRoundTripTime * 1000;
            }
            if (report.type === 'inbound-rtp') {
              packetLoss = report.packetsLost;
            }
          });

          if (rtt < 100 && packetLoss < 2) setConnectionQuality('good');
          else if (rtt < 300 && packetLoss < 5) setConnectionQuality('fair');
          else setConnectionQuality('poor');
        } catch (e) {
          console.error('Error getting stats:', e);
        }
      }, 3000);
    } else {
      setConnectionQuality('searching');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callActive]);

  // Call timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callActive]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const ConnectionIcon = () => {
    switch (connectionQuality) {
      case 'good': 
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20">
            <SignalHigh className="w-4 h-4 text-green-500" />
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-tight">Good</span>
          </div>
        );
      case 'fair': 
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20">
            <SignalMedium className="w-4 h-4 text-yellow-500" />
            <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-tight">Fair</span>
          </div>
        );
      case 'poor': 
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20">
            <SignalLow className="w-4 h-4 text-red-500" />
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-tight">Poor</span>
          </div>
        );
      default: 
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/10 border border-muted/20">
            <SignalZero className="w-4 h-4 text-muted-foreground animate-pulse" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Searching</span>
          </div>
        );
    }
  };

  // Listen for incoming call signals through P2P data channel
  useEffect(() => {
    const handleP2PMessage = (event: CustomEvent) => {
      const message = event.detail;
      
      if (message.type === 'call-offer') {
        console.log('Incoming call offer:', message.data);
        setIncomingCall(true);
        setIncomingCallType(message.data.callType);
        // Signal may have arrived first (out-of-order); preserve if already stored
        setHasOfferSignal(!!sessionStorage.getItem('call-offer-signal'));
        playGentleRingtone();
      } else if (message.type === 'call-signal') {
        const sig = message.data?.signal;
        if (mediaCallRef.current && sig) {
          mediaCallRef.current.signal(sig);
          if (sig.type === 'offer') {
            sessionStorage.setItem('call-offer-signal', JSON.stringify(sig));
            setHasOfferSignal(true);
          }
        } else if (sig && sig.type === 'offer') {
          sessionStorage.setItem('call-offer-signal', JSON.stringify(sig));
          setHasOfferSignal(true);
        }
      } else if (message.type === 'call-end') {
        endCall();
      } else if (message.type === 'audio-chunk') {
        if (isFallbackMode && audioDecoderRef.current && message.data.chunk) {
          const buffer = base64ToArrayBuffer(message.data.chunk);
          audioDecoderRef.current.playChunk({
            data: buffer,
            timestamp: message.data.timestamp,
            sampleRate: message.data.sampleRate || 16000,
          });
        }
      } else if (message.type === 'fallback-audio-start') {
        startFallbackAudioReceiver();
      }
    };

    window.addEventListener('p2p-message', handleP2PMessage as EventListener);
    return () => {
      window.removeEventListener('p2p-message', handleP2PMessage as EventListener);
      stopRingtone();
    };
  }, []);

  // Accept call when navigated here from IncomingCallOverlay on another tab (handler uses ref to avoid stale sendP2P/initiatePeerConnection)
  useEffect(() => {
    const handler = (e: CustomEvent<{ callType: 'audio' | 'video' }>) => {
      const callType = e.detail?.callType;
      if (!callType) return;
      sessionStorage.removeItem('dodi-pending-accept');
      acceptCallFromPendingRef.current(callType);
    };
    window.addEventListener('dodi-accept-call', handler as EventListener);

    // In case we mounted before the event fired, check sessionStorage
    const pending = sessionStorage.getItem('dodi-pending-accept') as 'audio' | 'video' | null;
    if (pending && (pending === 'audio' || pending === 'video')) {
      sessionStorage.removeItem('dodi-pending-accept');
      acceptCallFromPendingRef.current(pending);
    }

    return () => window.removeEventListener('dodi-accept-call', handler as EventListener);
  }, []);

  const acceptCallFromPending = async (callType: 'audio' | 'video') => {
    if (acceptFromPendingInProgressRef.current) return;
    acceptFromPendingInProgressRef.current = true;

    try {
      stopRingtone();
      setCallActive(true);
      setCallType(callType);
      setIncomingCall(false);
      setHasOfferSignal(false);

      const offerSignalStr = sessionStorage.getItem('call-offer-signal');
      const offerSignal = offerSignalStr ? JSON.parse(offerSignalStr) : null;
      sessionStorage.removeItem('call-offer-signal');

      if (!offerSignal) {
        setCallActive(false);
        setCallType(null);
        sendP2P({ type: 'call-end', data: {}, timestamp: Date.now() });
        return;
      }

      const peer = await initiatePeerConnection(callType, false, offerSignal);
      if (!peer) {
        setCallActive(false);
        setCallType(null);
        sendP2P({
          type: 'call-end',
          data: {},
          timestamp: Date.now(),
        });
        return;
      }

      sendP2P({
        type: 'call-accept',
        data: { callType },
        timestamp: Date.now(),
      });
    } finally {
      acceptFromPendingInProgressRef.current = false;
    }
  };
  acceptCallFromPendingRef.current = acceptCallFromPending;

  const stopRingtone = () => {
    if (audioContextRef.current) {
      ringtoneOscillatorsRef.current.forEach(osc => {
        try { osc.stop(); } catch (e) {}
      });
      ringtoneOscillatorsRef.current = [];
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  };

  const playGentleRingtone = () => {
    try {
      stopRingtone();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;

      const playChime = (time: number, freq: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.2, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 2);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(time);
        osc.stop(time + 2);
        ringtoneOscillatorsRef.current.push(osc);
      };

      // Loop the gentle chime
      const sequence = () => {
        if (!audioContextRef.current) return;
        const now = ctx.currentTime;
        playChime(now, 440); // A4
        playChime(now + 0.5, 554.37); // C#5
        playChime(now + 1.0, 659.25); // E5
        
        setTimeout(sequence, 3000);
      };

      sequence();

      if ('vibrate' in navigator) {
        navigator.vibrate([500, 200, 500, 200, 500]);
      }
    } catch (e) {
      console.error('Error playing Web Audio ringtone:', e);
    }
  };

  const startFallbackAudio = async () => {
    console.log('Starting fallback audio mode over DataChannel');
    setIsFallbackMode(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      
      const encoder = new AudioEncoder();
      audioEncoderRef.current = encoder;
      
      await encoder.start(stream, (chunk) => {
        sendP2P({
          type: 'audio-chunk',
          data: {
            chunk: arrayBufferToBase64(chunk.data),
            timestamp: chunk.timestamp,
            sampleRate: chunk.sampleRate,
          },
          timestamp: Date.now(),
        });
      });
      
      const decoder = new AudioDecoder();
      audioDecoderRef.current = decoder;
      await decoder.start();
      
      sendP2P({
        type: 'fallback-audio-start',
        data: {},
        timestamp: Date.now(),
      });
      
      toast({
        title: 'Audio fallback active',
        description: 'Using backup audio connection through chat tunnel',
      });
    } catch (error) {
      console.error('Failed to start fallback audio:', error);
      toast({
        title: 'Fallback failed',
        description: 'Could not start backup audio connection',
        variant: 'destructive',
      });
      endCall();
    }
  };

  const startFallbackAudioReceiver = async () => {
    console.log('Partner started fallback audio, initializing receiver');
    setIsFallbackMode(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      
      const encoder = new AudioEncoder();
      audioEncoderRef.current = encoder;
      
      await encoder.start(stream, (chunk) => {
        sendP2P({
          type: 'audio-chunk',
          data: {
            chunk: arrayBufferToBase64(chunk.data),
            timestamp: chunk.timestamp,
            sampleRate: chunk.sampleRate,
          },
          timestamp: Date.now(),
        });
      });
      
      const decoder = new AudioDecoder();
      audioDecoderRef.current = decoder;
      await decoder.start();
    } catch (error) {
      console.error('Failed to start fallback audio receiver:', error);
    }
  };

  const stopFallbackAudio = () => {
    if (audioEncoderRef.current) {
      audioEncoderRef.current.stop();
      audioEncoderRef.current = null;
    }
    if (audioDecoderRef.current) {
      audioDecoderRef.current.stop();
      audioDecoderRef.current = null;
    }
    setIsFallbackMode(false);
  };

  const attemptReconnect = async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      toast({
        title: 'Connection lost',
        description: 'Unable to reconnect after multiple attempts. Switching to fallback audio.',
      });
      if (callType === 'audio') {
        await startFallbackAudio();
      } else {
        endCall();
      }
      return;
    }

    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);
    
    toast({
      title: 'Reconnecting...',
      description: `Attempt ${reconnectAttempts + 1} of ${MAX_RECONNECT_ATTEMPTS}`,
    });

    if (mediaCallRef.current) {
      mediaCallRef.current.destroy();
      mediaCallRef.current = null;
    }

    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        const peer = await initiatePeerConnection(callType!, true);
        if (!peer) {
          attemptReconnect();
          return;
        }
        setIsReconnecting(false);
        toast({
          title: 'Reconnected',
          description: 'Call connection restored',
        });
      } catch (error) {
        console.error('Reconnect failed:', error);
        attemptReconnect();
      }
    }, 2000);
  };

  const initiatePeerConnection = async (type: 'audio' | 'video', isInitiator: boolean, offerSignal?: any) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
          title: 'Not supported',
          description: 'Your browser does not support video/audio calls',
          variant: 'destructive',
        });
        return null;
      }

      const constraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };

      console.log('Requesting media permissions:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      if (type === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const peer = new SimplePeer({
        initiator: isInitiator,
        trickle: true,
        stream: stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      mediaCallRef.current = peer;

      peer.on('signal', (signal: any) => {
        console.log('Call signal generated, sending through P2P');
        // Send the signal through the P2P data channel
        sendP2P({
          type: 'call-signal',
          data: { signal, callType: type },
          timestamp: Date.now(),
        });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        console.log('Remote stream received');
        if (type === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.muted = true;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          const el = remoteAudioRef.current;
          const setSink = (el as HTMLMediaElement & { setSinkId?(id: string): Promise<void> }).setSinkId?.bind(el);
          if (typeof setSink === 'function') {
            const on = speakerOnRef.current;
            if (on) {
              setSink('').catch(() => {});
            } else {
              const earpiece = audioOutputDevicesRef.current.find(d => /earpiece|receiver/i.test(d.label));
              if (earpiece) setSink(earpiece.deviceId).catch(() => {});
            }
          }
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Media peer error:', err);
        if (callActive && !isReconnecting) {
          attemptReconnect();
        }
      });

      peer.on('close', () => {
        if (callActive && !isReconnecting && !isFallbackMode) {
          attemptReconnect();
        }
      });

      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
      fallbackTimeoutRef.current = setTimeout(() => {
        if (callActive && !mediaCallRef.current?.connected && type === 'audio' && !isFallbackMode) {
          console.log('WebRTC connection timeout, switching to fallback audio');
          startFallbackAudio();
        }
      }, 5000);

      // If we're the answerer, immediately signal the offer we received
      if (!isInitiator && offerSignal) {
        console.log('Accepting offer signal');
        peer.signal(offerSignal);
      }

      return peer;
    } catch (error: any) {
      console.error('Error accessing media:', error);
      
      let title = 'Permission denied';
      let description = 'Unable to access microphone/camera';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        title = 'Camera/Mic blocked';
        description = type === 'video' 
          ? 'Please allow camera and microphone access in your browser settings.'
          : 'Please allow microphone access in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        title = 'No device found';
        description = type === 'video'
          ? 'No camera or microphone detected.'
          : 'No microphone detected.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        title = 'Device in use';
        description = 'Your camera or microphone is already in use by another app.';
      } else if (error.name === 'SecurityError') {
        title = 'Security error';
        description = 'Calls require HTTPS. Please use a secure connection.';
      }
      
      toast({
        title,
        description,
        variant: 'destructive',
      });
      
      setCallActive(false);
      setCallType(null);
      return null;
    }
  };

  const startCall = async (type: 'audio' | 'video') => {
    if (!partnerId) {
      toast({
        title: 'Not paired',
        description: 'You need to pair with your beloved first',
        variant: 'destructive',
      });
      return;
    }

    if (!peerState.connected) {
      toast({
        title: 'Connecting...',
        description: 'P2P connection establishing. Try again in a moment.',
        variant: 'default',
      });
      return;
    }

    setCallActive(true);
    setCallType(type);

    const peer = await initiatePeerConnection(type, true);
    if (!peer) {
      setCallActive(false);
      setCallType(null);
      return;
    }

    sendP2P({
      type: 'call-offer',
      data: { callType: type, fromUserId: userId },
      timestamp: Date.now(),
    });

    toast({
      title: 'Calling your partner',
      description: 'Please be patient while we reach them. Reconnecting if needed.',
      duration: 4000,
    });
  };

  const acceptCall = async () => {
    if (!incomingCallType) return;

    stopRingtone();
    setCallActive(true);
    setCallType(incomingCallType);
    setIncomingCall(false);
    setHasOfferSignal(false);

    const offerSignalStr = sessionStorage.getItem('call-offer-signal');
    const offerSignal = offerSignalStr ? JSON.parse(offerSignalStr) : null;
    sessionStorage.removeItem('call-offer-signal');

    const peer = await initiatePeerConnection(incomingCallType, false, offerSignal);
    if (!peer) {
      sendP2P({
        type: 'call-end',
        data: {},
        timestamp: Date.now(),
      });
      return;
    }

    sendP2P({
      type: 'call-accept',
      data: { callType: incomingCallType },
      timestamp: Date.now(),
    });
  };

  const rejectCall = () => {
    stopRingtone();
    setIncomingCall(false);
    setHasOfferSignal(false);
    sessionStorage.removeItem('call-offer-signal');
    sendP2P({
      type: 'call-reject',
      data: {},
      timestamp: Date.now(),
    });
  };

  const endCall = () => {
    stopRingtone();
    stopFallbackAudio();
    setIncomingCall(false);
    setHasOfferSignal(false);
    sessionStorage.removeItem('call-offer-signal');

    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setIsReconnecting(false);
    setReconnectAttempts(0);
    setSpeakerOn(true);

    if (mediaCallRef.current) {
      mediaCallRef.current.destroy();
      mediaCallRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setCallActive(false);
    setCallType(null);

    // Notify partner through P2P data channel
    sendP2P({
      type: 'call-end',
      data: {},
      timestamp: Date.now(),
    });
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setMicEnabled(!micEnabled);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setCameraEnabled(!cameraEnabled);
    }
  };

  const applySpeakerSink = useCallback((on: boolean) => {
    const el = remoteAudioRef.current;
    if (!el || typeof (el as HTMLMediaElement & { setSinkId?(id: string): Promise<void> }).setSinkId !== 'function') return;
    const setSink = (el as HTMLMediaElement & { setSinkId?(id: string): Promise<void> }).setSinkId?.bind(el);
    if (!setSink) return;
    if (on) {
      setSink('').catch(() => {});
    } else {
      const devices = audioOutputDevicesRef.current;
      const earpiece = devices.find(d => /earpiece|receiver/i.test(d.label));
      if (earpiece) setSink(earpiece.deviceId).catch(() => {});
    }
  }, []);

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    applySpeakerSink(next);
  };

  useEffect(() => {
    if (!callActive || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(devices => {
      audioOutputDevicesRef.current = devices.filter(d => d.kind === 'audiooutput');
    });
  }, [callActive]);

  speakerOnRef.current = speakerOn;
  useEffect(() => {
    if (callActive) applySpeakerSink(speakerOn);
  }, [callActive, speakerOn, applySpeakerSink]);

  const incomingCallOverlay = incomingCall ? (
    <div
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black text-white gap-6"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-light">Incoming {incomingCallType} call</h2>
        <p className="text-white/70">Your beloved is calling...</p>
      </div>

      <div className="flex gap-4">
        <Button
          size="lg"
          onClick={acceptCall}
          disabled={!hasOfferSignal}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
          data-testid="button-accept-call"
        >
          <Phone className="w-5 h-5 mr-2" />
          {hasOfferSignal ? 'Accept' : 'Connecting…'}
        </Button>
        <Button
          size="lg"
          variant="destructive"
          onClick={rejectCall}
          data-testid="button-reject-call"
        >
          <PhoneOff className="w-5 h-5 mr-2" />
            Decline
        </Button>
      </div>
    </div>
  ) : null;

  const activeCallOverlay = callActive ? (
    <div
      className="fixed inset-0 z-[150] flex flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
        <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" aria-hidden />
        <div className="flex-1 flex items-center justify-center gap-4 p-4 relative">
          {/* Prominent Call Timer Overlay */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="bg-white/10 backdrop-blur-xl px-8 py-3 rounded-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-1 transition-all animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.8)]" />
                <span className="text-white/70 text-[10px] uppercase tracking-[0.2em] font-medium">Live</span>
              </div>
              <span className="text-white font-mono text-4xl tracking-tighter tabular-nums drop-shadow-md">
                {formatDuration(callDuration)}
              </span>
            </div>
          </div>

          {callType === 'video' && (
            <>
              <div className="flex-1 max-w-md w-full aspect-video">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full rounded-lg bg-muted object-cover"
                  data-testid="video-remote"
                />
              </div>
              <div className="absolute top-4 right-4 w-32 aspect-video z-10">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full rounded-lg bg-muted object-cover border-2 border-background shadow-lg"
                  data-testid="video-local"
                />
              </div>
            </>
          )}

          {callType === 'audio' && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/10 flex items-center justify-center">
                {isReconnecting ? (
                  <WifiOff className="w-10 h-10 text-yellow-400 animate-pulse" />
                ) : (
                  <Phone className="w-10 h-10 text-white/80 animate-pulse" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  {isReconnecting ? (
                    <p className="text-yellow-400 font-medium animate-pulse">Reconnecting... ({reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS})</p>
                  ) : isFallbackMode ? (
                    <>
                      <Wifi className="w-4 h-4 text-blue-400" />
                      <p className="text-blue-400">Using backup connection</p>
                    </>
                  ) : (
                    <>
                      <p className="text-white/70">Audio call active</p>
                      <ConnectionIcon />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 bg-white/5 p-4 flex-shrink-0">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-3">
              <ConnectionIcon />
              <Button
                size="icon"
                variant={micEnabled ? 'secondary' : 'destructive'}
                onClick={toggleMic}
                data-testid="button-toggle-mic"
                className="rounded-full"
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </Button>

              <Button
                size="icon"
                variant={speakerOn ? 'default' : 'secondary'}
                onClick={toggleSpeaker}
                data-testid="button-speaker"
                title={speakerOn ? 'Speaker on' : 'Speaker off'}
                className="rounded-full"
              >
                <Volume2 className="w-5 h-5" />
              </Button>

              {callType === 'video' && (
                <Button
                  size="icon"
                  variant={cameraEnabled ? 'secondary' : 'destructive'}
                  onClick={toggleCamera}
                  data-testid="button-toggle-camera"
                  className="rounded-full"
                >
                  {cameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                </Button>
              )}

              <Button
                size="icon"
                variant="destructive"
                onClick={endCall}
                data-testid="button-end-call"
                className="rounded-full"
              >
                <PhoneOff className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
  ) : null;

  // Portal call overlays to body so they render above the nav (z-20)
  const callOverlay = incomingCallOverlay ?? activeCallOverlay;
  if (callOverlay && typeof document !== 'undefined') {
    return (
      <>
        {createPortal(callOverlay, document.body)}
        <div className="flex-1 min-h-0 flex flex-col bg-background" aria-hidden />
      </>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="flex-shrink-0 px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Voice & Video</h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <Card className="bg-blush/5 border-blush/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blush/20 flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-blush" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium text-sm">First time calling?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When you start a call, your browser will ask for permission to use your camera and microphone. 
                  Click "Allow" to enable calls. Your call is completely encrypted and peer-to-peer.
                </p>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-center gap-6">
            <Card className="p-8 space-y-4 hover-elevate cursor-pointer" data-testid="card-audio-call">
              <div className="w-16 h-16 mx-auto rounded-full bg-sage/20 flex items-center justify-center">
                <Phone className="w-8 h-8 text-sage" />
              </div>
              <h3 className="text-center font-medium">Audio Call</h3>
              <p className="text-xs text-center text-muted-foreground">Voice only</p>
              <Button
                onClick={() => startCall('audio')}
                disabled={!peerState.connected}
                className="w-full"
                data-testid="button-start-audio"
              >
                {peerState.connected ? 'Start' : 'Connecting...'}
              </Button>
            </Card>

            <Card className="p-8 space-y-4 hover-elevate cursor-pointer" data-testid="card-video-call">
              <div className="w-16 h-16 mx-auto rounded-full bg-blush/20 flex items-center justify-center">
                <Video className="w-8 h-8 text-blush" />
              </div>
              <h3 className="text-center font-medium">Video Call</h3>
              <p className="text-xs text-center text-muted-foreground">See each other</p>
              <Button
                onClick={() => startCall('video')}
                disabled={!peerState.connected}
                className="w-full"
                data-testid="button-start-video"
              >
                {peerState.connected ? 'Start' : 'Connecting...'}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
