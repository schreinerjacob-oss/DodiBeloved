import { useState, useEffect, useRef } from 'react';
import { useDodi } from '@/contexts/DodiContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWebSocket } from '@/hooks/use-websocket';
import { Phone, Video, PhoneOff, Mic, MicOff, Camera, CameraOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// @ts-ignore - simple-peer doesn't have type definitions
import SimplePeer from 'simple-peer';

export default function CallsPage() {
  const { userId, partnerId } = useDodi();
  const { toast } = useToast();
  const { send: sendWS, ws, connected } = useWebSocket();
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const [incomingCallType, setIncomingCallType] = useState<'audio' | 'video' | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [peerRef] = useState<{ current: SimplePeer.Instance | null }>({ current: null });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Handle incoming call signaling
  useEffect(() => {
    if (!ws || !partnerId) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'call-offer') {
          setIncomingCall(true);
          setIncomingCallType(data.data.callType);
        } else if (data.type === 'call-signal') {
          if (peerRef.current && data.data.signal) {
            peerRef.current.signal(data.data.signal);
          }
        } else if (data.type === 'call-end') {
          endCall();
        }
      } catch (e) {
        console.log('WebSocket message parse error:', e);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, partnerId, peerRef]);

  const initiatePeerConnection = async (type: 'audio' | 'video') => {
    try {
      // Check if getUserMedia is supported
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
      console.log('Media permissions granted, stream:', stream);
      localStreamRef.current = stream;

      if (type === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const isInitiator = true;
      const peer = new SimplePeer({
        initiator: isInitiator,
        trickleIce: true,
        stream: stream,
      });

      peerRef.current = peer;

      peer.on('signal', (signal: any) => {
        sendWS({
          type: 'call-signal',
          data: { signal, callType: type },
        });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Peer error:', err);
        toast({
          title: 'Connection error',
          description: 'Failed to establish connection',
          variant: 'destructive',
        });
        endCall();
      });

      peer.on('close', () => {
        endCall();
      });

      return peer;
    } catch (error: any) {
      console.error('Error accessing media:', error);
      
      let title = 'Permission denied';
      let description = 'Unable to access microphone/camera';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        title = 'Camera/Mic blocked';
        description = type === 'video' 
          ? 'Please allow camera and microphone access in your browser settings, then try again.'
          : 'Please allow microphone access in your browser settings, then try again.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        title = 'No device found';
        description = type === 'video'
          ? 'No camera or microphone detected. Please connect a device and try again.'
          : 'No microphone detected. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        title = 'Device in use';
        description = 'Your camera or microphone is already being used by another app. Please close it and try again.';
      } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
        title = 'Device limitation';
        description = 'Your device does not meet the requirements for this call.';
      } else if (error.name === 'TypeError') {
        title = 'Invalid constraints';
        description = 'There was an error configuring the call. Please try again.';
      } else if (error.name === 'SecurityError') {
        title = 'Security error';
        description = 'Calls require HTTPS. Please access the app through a secure connection.';
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

    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Connecting...',
        description: 'WebSocket connection establishing. Try again in a moment.',
        variant: 'default',
      });
      return;
    }

    setCallActive(true);
    setCallType(type);

    sendWS({
      type: 'call-offer',
      data: { callType: type, fromUserId: userId },
    });

    await initiatePeerConnection(type);
  };

  const acceptCall = async () => {
    if (!incomingCallType) return;

    setCallActive(true);
    setCallType(incomingCallType);
    setIncomingCall(false);

    sendWS({
      type: 'call-accept',
      data: { callType: incomingCallType },
    });

    await initiatePeerConnection(incomingCallType);
  };

  const rejectCall = () => {
    setIncomingCall(false);
    sendWS({
      type: 'call-reject',
      data: {},
    });
  };

  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setCallActive(false);
    setCallType(null);

    sendWS({
      type: 'call-end',
      data: {},
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
        <div className="flex-1 flex items-center justify-center gap-4 p-4">
          {callType === 'video' && (
            <>
              <div className="flex-1 max-w-md">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full rounded-lg bg-muted"
                  data-testid="video-remote"
                />
              </div>
              <div className="absolute bottom-4 right-4 w-24 h-24">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full rounded-lg bg-muted"
                  data-testid="video-local"
                />
              </div>
            </>
          )}

          {callType === 'audio' && (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-sage/20 flex items-center justify-center">
                <Phone className="w-10 h-10 text-sage animate-pulse" />
              </div>
              <p className="text-muted-foreground">Audio call active</p>
            </div>
          )}
        </div>

        <div className="border-t bg-card/50 p-4 flex-shrink-0">
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
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-6 py-4 border-b bg-card/50">
        <h2 className="text-xl font-light text-foreground">Voice & Video</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {connected ? '✓ Connected & ready' : '⏳ Connecting...'}
        </p>
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
                  Click "Allow" to enable calls. If you accidentally blocked access, you can reset it in your browser settings.
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
                disabled={!connected}
                className="w-full"
                data-testid="button-start-audio"
              >
                {connected ? 'Start' : 'Connecting...'}
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
                disabled={!connected}
                className="w-full"
                data-testid="button-start-video"
              >
                {connected ? 'Start' : 'Connecting...'}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
