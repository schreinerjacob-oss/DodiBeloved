import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { getMediaBlob } from '@/lib/storage';

export function MessageMediaVoice({ messageId }: { messageId: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const revokeCurrentUrl = () => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError(null);
      const blob = await getMediaBlob(messageId, 'message');
      if (cancelled) return;
      revokeCurrentUrl();
      if (blob) {
        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;
        setAudioUrl(url);
        // Preload duration via a temporary audio element
        const tmp = new Audio(url);
        tmp.onloadedmetadata = () => {
          if (!cancelled) setDuration(tmp.duration);
          tmp.remove();
        };
        tmp.onerror = () => {
          if (!cancelled) setDuration(null);
          tmp.remove();
        };
      } else {
        setAudioUrl(null);
        setDuration(null);
      }
    };

    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mediaId?: string; kind?: string } | undefined;
      if (detail?.mediaId === messageId && detail?.kind === 'message') {
        load();
      }
    };

    load();
    window.addEventListener('dodi-media-ready', onReady);

    return () => {
      cancelled = true;
      window.removeEventListener('dodi-media-ready', onReady);
      revokeCurrentUrl();
      setAudioUrl(null);
    };
  }, [messageId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((e) => {
        console.warn('Voice play failed:', e);
        setError('Playback failed');
      });
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm">
        <span>{error}</span>
      </div>
    );
  }

  if (!audioUrl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted animate-pulse text-muted-foreground text-sm min-w-[160px]">
        <div className="w-5 h-5 rounded-full bg-muted-foreground/30" />
        <span className="text-xs">Loading voice…</span>
      </div>
    );
  }

  const durationStr =
    duration != null
      ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
      : '0:00';

  return (
    <div className="flex items-center gap-3 px-3 py-2 min-w-[200px]">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        type="button"
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-sage/20 hover:bg-sage/30 flex items-center justify-center text-sage transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">{durationStr}</span>
        <span className="text-xs text-muted-foreground truncate">Voice message</span>
      </div>
    </div>
  );
}
