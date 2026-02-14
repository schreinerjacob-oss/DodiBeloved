import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { usePeerConnection } from '@/hooks/use-peer-connection';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff } from 'lucide-react';

const PENDING_ACCEPT_KEY = 'dodi-pending-accept';

export function IncomingCallOverlay() {
  const [location, setLocation] = useLocation();
  const { send: sendP2P } = usePeerConnection();
  const [incomingCall, setIncomingCall] = useState(false);
  const [incomingCallType, setIncomingCallType] = useState<'audio' | 'video' | null>(null);
  const [hasOfferSignal, setHasOfferSignal] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneOscillatorsRef = useRef<OscillatorNode[]>([]);

  const stopRingtone = () => {
    ringtoneOscillatorsRef.current.forEach((osc) => {
      try {
        osc.stop();
      } catch {}
    });
    ringtoneOscillatorsRef.current = [];
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    if ('vibrate' in navigator) navigator.vibrate(0);
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
      if ('vibrate' in navigator) navigator.vibrate([500, 200, 500, 200, 500]);
    } catch (e) {
      console.error('Error playing ringtone:', e);
    }
  };

  useEffect(() => {
    const handleP2PMessage = (event: CustomEvent) => {
      const message = event.detail;
      if (message.type === 'call-offer') {
        setIncomingCall(true);
        setIncomingCallType(message.data?.callType ?? 'audio');
        setHasOfferSignal(!!sessionStorage.getItem('call-offer-signal'));
        playGentleRingtone();
      } else if (message.type === 'call-signal') {
        const sig = message.data?.signal;
        if (sig && sig.type === 'offer') {
          sessionStorage.setItem('call-offer-signal', JSON.stringify(sig));
          setHasOfferSignal(true);
        }
      } else if (message.type === 'call-end') {
        stopRingtone();
        setIncomingCall(false);
        setIncomingCallType(null);
        setHasOfferSignal(false);
        sessionStorage.removeItem('call-offer-signal');
        sessionStorage.removeItem(PENDING_ACCEPT_KEY);
      }
    };

    window.addEventListener('p2p-message', handleP2PMessage as EventListener);
    return () => {
      window.removeEventListener('p2p-message', handleP2PMessage as EventListener);
      stopRingtone();
    };
  }, []);

  const handleAccept = () => {
    if (!incomingCallType || !hasOfferSignal) return;
    const callTypeToAccept = incomingCallType;
    stopRingtone();
    sessionStorage.setItem(PENDING_ACCEPT_KEY, callTypeToAccept);
    setIncomingCall(false);
    setIncomingCallType(null);
    setHasOfferSignal(false);
    setLocation('/calls');
    // Fire after CallsPage mounts so it can run accept
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('dodi-accept-call', { detail: { callType: callTypeToAccept } }));
    });
  };

  const handleReject = () => {
    stopRingtone();
    setIncomingCall(false);
    setIncomingCallType(null);
    setHasOfferSignal(false);
    sessionStorage.removeItem('call-offer-signal');
    sessionStorage.removeItem(PENDING_ACCEPT_KEY);
    sendP2P({
      type: 'call-reject',
      data: {},
      timestamp: Date.now(),
    });
  };

  // Only show overlay when we have an incoming call and user is NOT on the Calls tab
  if (!incomingCall || location === '/calls') return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black text-white gap-6"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-light">Incoming {incomingCallType} call</h2>
        <p className="text-white/70">Your beloved is calling...</p>
      </div>

      <div className="flex gap-4">
        <Button
          size="lg"
          onClick={handleAccept}
          disabled={!hasOfferSignal}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
          data-testid="button-accept-call-overlay"
        >
          <Phone className="w-5 h-5 mr-2" />
          {hasOfferSignal ? 'Accept' : 'Connecting…'}
        </Button>
        <Button
          size="lg"
          variant="destructive"
          onClick={handleReject}
          data-testid="button-reject-call-overlay"
        >
          <PhoneOff className="w-5 h-5 mr-2" />
          Decline
        </Button>
      </div>
    </div>
  );
}
