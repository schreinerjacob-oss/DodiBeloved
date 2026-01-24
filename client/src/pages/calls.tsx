import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff, SignalHigh, SignalMedium, SignalLow, SignalZero, Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SimplePeer from 'simple-peer';

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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorsRef = useRef<OscillatorNode[]>([]);
  const mediaCallRef = useRef<SimplePeer.Instance | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
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

      const sequence = () => {
        if (!audioContextRef.current) return;
        const now = ctx.currentTime;
        playChime(now, 440);
        playChime(now + 0.5, 554.37);
        playChime(now + 1.0, 659.25);
        
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

  const endCall = () => {
    stopRingtone();
    
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

    sendP2P({
      type: 'call-end',
      data: {},
      timestamp: Date.now(),
    });
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
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });

      mediaCallRef.current = peer;

      peer.on('signal', (signal: any) => {
        sendP2P({
          type: 'call-signal',
          data: { signal, callType: type },
          timestamp: Date.now(),
        });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
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
        if (callActive && !isReconnecting) {
          attemptReconnect();
        }
      });

      if (!isInitiator && offerSignal) {
        peer.signal(offerSignal);
      }

      return peer;
    } catch (error: any) {
      console.error('Error accessing media:', error);
      toast({
        title: 'Media Error',
        description: 'Unable to access camera or microphone',
        variant: 'destructive',
      });
      setCallActive(false);
      setCallType(null);
      return null;
    }
  };

  const attemptReconnect = async () => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      toast({
        title: 'Connection lost',
        description: 'Unable to reconnect after multiple attempts.',
      });
      endCall();
      return;
    }

    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);
    
    if (mediaCallRef.current) {
      mediaCallRef.current.destroy();
      mediaCallRef.current = null;
    }

    reconnectTimeoutRef.current = setTimeout(async () => {
      try {
        await initiatePeerConnection(callType!, true);
        setIsReconnecting(false);
      } catch (error) {
        attemptReconnect();
      }
    }, 2000);
  };

  useEffect(() => {
    const handleP2PMessage = (event: CustomEvent) => {
      const message = event.detail;
      if (message.type === 'call-offer') {
        setIncomingCall(true);
        setIncomingCallType(message.data.callType);
        sessionStorage.setItem('call-offer-signal', JSON.stringify(message.data.signal));
        playGentleRingtone();
      } else if (message.type === 'call-signal') {
        if (mediaCallRef.current) {
          mediaCallRef.current.signal(message.data.signal);
        }
      } else if (message.type === 'call-end') {
        endCall();
      }
    };

    window.addEventListener('p2p-message', handleP2PMessage as EventListener);
    return () => {
      window.removeEventListener('p2p-message', handleP2PMessage as EventListener);
      stopRingtone();
    };
  }, []);

  const startCall = async (type: 'audio' | 'video') => {
    if (!partnerId) {
      toast({ title: 'Not paired', variant: 'destructive' });
      return;
    }
    setCallActive(true);
    setCallType(type);
    await initiatePeerConnection(type, true);
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
    const offerSignalStr = sessionStorage.getItem('call-offer-signal');
    const offerSignal = offerSignalStr ? JSON.parse(offerSignalStr) : null;
    sessionStorage.removeItem('call-offer-signal');
    await initiatePeerConnection(incomingCallType, false, offerSignal);
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
    sendP2P({ type: 'call-reject', data: {}, timestamp: Date.now() });
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
      <div className="h-full flex flex-col items-center justify-center bg-background gap-6 p-6 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-light">Incoming {incomingCallType} call</h2>
          <p className="text-muted-foreground text-sm">Your beloved is calling...</p>
        </div>
        <div className="flex gap-4">
          <Button size="lg" onClick={acceptCall} className="bg-green-600 hover:bg-green-700">
            <Phone className="w-5 h-5 mr-2" />
            Accept
          </Button>
          <Button size="lg" variant="destructive" onClick={rejectCall}>
            <PhoneOff className="w-5 h-5 mr-2" />
            Decline
          </Button>
        </div>
      </div>
    );
  }

  if (callActive) {
    return (
      <div className="h-full flex flex-col bg-background relative overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 bg-black/40 backdrop-blur-xl px-6 py-2 rounded-2xl border border-white/10 flex flex-col items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white/70 text-[10px] uppercase tracking-widest">Live</span>
            </div>
            <span className="text-white font-mono text-2xl tracking-tighter">
              {formatDuration(callDuration)}
            </span>
          </div>

          {callType === 'video' ? (
            <div className="w-full h-full relative">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover rounded-2xl" />
              <div className="absolute bottom-24 right-4 w-32 aspect-video z-10">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-xl border-2 border-background shadow-xl" />
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-32 h-32 mx-auto rounded-full bg-accent/10 flex items-center justify-center animate-pulse">
                <Phone className="w-12 h-12 text-accent" />
              </div>
              <h3 className="text-xl font-light">Audio Call Active</h3>
            </div>
          )}
        </div>

        <div className="p-8 border-t bg-card/50 backdrop-blur-md z-50">
          <div className="max-w-md mx-auto flex flex-col gap-6">
            <div className="flex justify-center">
              <ConnectionIcon />
            </div>
            <div className="flex items-center justify-center gap-6">
              <Button variant={micEnabled ? 'outline' : 'destructive'} size="icon" onClick={toggleMic} className="h-14 w-14 rounded-full">
                {micEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={endCall} className="h-16 w-16 rounded-full shadow-2xl">
                <PhoneOff className="w-8 h-8" />
              </Button>
              {callType === 'video' && (
                <Button variant={cameraEnabled ? 'outline' : 'destructive'} size="icon" onClick={toggleCamera} className="h-14 w-14 rounded-full">
                  {cameraEnabled ? <Camera className="w-6 h-6" /> : <CameraOff className="w-6 h-6" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-6 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Calls</h2>
        <p className="text-xs text-muted-foreground mt-1 tracking-tight">Direct P2P. Private forever.</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-12">
        <div className="w-24 h-24 rounded-full bg-accent/5 flex items-center justify-center animate-gentle-pulse">
          <Heart className="w-12 h-12 text-accent/40" />
        </div>

        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <Card className="p-8 flex flex-col items-center gap-4 cursor-pointer hover-elevate transition-all border-accent/10 group" onClick={() => startCall('audio')}>
            <div className="p-4 rounded-full bg-accent/5 group-hover:bg-accent/10">
              <Phone className="w-8 h-8 text-accent" />
            </div>
            <span className="text-sm font-medium tracking-tight">Audio</span>
          </Card>
          <Card className="p-8 flex flex-col items-center gap-4 cursor-pointer hover-elevate transition-all border-accent/10 group" onClick={() => startCall('video')}>
            <div className="p-4 rounded-full bg-accent/5 group-hover:bg-accent/10">
              <Video className="w-8 h-8 text-accent" />
            </div>
            <span className="text-sm font-medium tracking-tight">Video</span>
          </Card>
        </div>

        <p className="max-w-[240px] text-center text-[10px] text-muted-foreground uppercase tracking-widest leading-loose">
          Encrypted Sanctuary Connection
        </p>
      </div>
    </div>
  );
}