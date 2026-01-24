import { useState, useEffect, useRef, useCallback } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Wifi, WifiOff } from 'lucide-react';
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
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | 'searching'>('searching');
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const mediaCallRef = useRef<SimplePeer.Instance | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioEncoderRef = useRef<AudioEncoder | null>(null);
  const audioDecoderRef = useRef<AudioDecoder | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
      case 'good': return <SignalHigh className="w-4 h-4 text-green-500" />;
      case 'fair': return <SignalMedium className="w-4 h-4 text-yellow-500" />;
      case 'poor': return <SignalLow className="w-4 h-4 text-red-500" />;
      default: return <SignalZero className="w-4 h-4 text-muted-foreground animate-pulse" />;
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
        // Store the offer signal for when we accept
        sessionStorage.setItem('call-offer-signal', JSON.stringify(message.data.signal));
        
        // Play ringtone and vibrate
        if (!ringtoneRef.current) {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
          audio.loop = true;
          ringtoneRef.current = audio;
        }
        ringtoneRef.current.play().catch(e => console.error('Error playing ringtone:', e));
        
        if ('vibrate' in navigator) {
          navigator.vibrate([500, 500, 500, 500]);
        }
      } else if (message.type === 'call-signal') {
        if (mediaCallRef.current && message.data.signal) {
          mediaCallRef.current.signal(message.data.signal);
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

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
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
        await initiatePeerConnection(callType!, true);
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
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
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
      }, 8000);

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

    // Send call offer through P2P data channel
    await initiatePeerConnection(type, true);
    
    // Notify partner of call offer
    sendP2P({
      type: 'call-offer',
      data: { callType: type, fromUserId: userId },
      timestamp: Date.now(),
    });
  };

  const acceptCall = async () => {
    if (!incomingCallType) return;

    stopRingtone();
    setCallActive(true);
    setCallType(incomingCallType);
    setIncomingCall(false);

    // Get the stored offer signal
    const offerSignalStr = sessionStorage.getItem('call-offer-signal');
    const offerSignal = offerSignalStr ? JSON.parse(offerSignalStr) : null;
    sessionStorage.removeItem('call-offer-signal');

    await initiatePeerConnection(incomingCallType, false, offerSignal);

    // Send call accept through P2P data channel
    sendP2P({
      type: 'call-accept',
      data: { callType: incomingCallType },
      timestamp: Date.now(),
    });
  };

  const rejectCall = () => {
    stopRingtone();
    setIncomingCall(false);
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

  if (incomingCall) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-light">Incoming {incomingCallType} call</h2>
          <p className="text-muted-foreground">Your beloved is calling...</p>
        </div>

        <div className="flex gap-4">
          <Button
            size="lg"
            onClick={acceptCall}
            className="bg-green-600 hover:bg-green-700"
            data-testid="button-accept-call"
          >
            <Phone className="w-5 h-5 mr-2" />
            Accept
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
    );
  }

  if (callActive) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex-1 flex items-center justify-center gap-4 p-4 relative">
          {/* Prominent Call Timer Overlay */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-xl px-8 py-3 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-1 transition-all animate-in fade-in slide-in-from-top-4 duration-500">
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
              <div className="w-20 h-20 mx-auto rounded-full bg-sage/20 flex items-center justify-center">
                {isReconnecting ? (
                  <WifiOff className="w-10 h-10 text-yellow-500 animate-pulse" />
                ) : (
                  <Phone className="w-10 h-10 text-sage animate-pulse" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  {isReconnecting ? (
                    <p className="text-yellow-500">Reconnecting... ({reconnectAttempts}/{MAX_RECONNECT_ATTEMPTS})</p>
                  ) : isFallbackMode ? (
                    <>
                      <Wifi className="w-4 h-4 text-blue-500" />
                      <p className="text-blue-500">Using backup connection</p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">Audio call active</p>
                      <ConnectionIcon />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-card/50 p-4 flex-shrink-0">
          <div className="flex flex-col items-center gap-4">
            {callType === 'video' && (
              <div className="flex items-center gap-3">
                <ConnectionIcon />
              </div>
            )}
            <div className="flex items-center justify-center gap-4">
              <Button
                size="icon"
                variant={micEnabled ? 'default' : 'destructive'}
                onClick={toggleMic}
                data-testid="button-toggle-mic"
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </Button>

              {callType === 'video' && (
                <Button
                  size="icon"
                  variant={cameraEnabled ? 'default' : 'destructive'}
                  onClick={toggleCamera}
                  data-testid="button-toggle-camera"
                >
                  {cameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                </Button>
              )}

              <Button
                size="icon"
                variant="destructive"
                onClick={endCall}
                data-testid="button-end-call"
              >
                <PhoneOff className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Voice & Video</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
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
