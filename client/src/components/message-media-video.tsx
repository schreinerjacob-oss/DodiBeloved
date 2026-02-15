import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { getMediaBlob } from '@/lib/storage';
import { cn } from '@/lib/utils';

export function MessageMediaVideo({ messageId }: { messageId: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const revokeCurrentUrl = () => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        setError(null);
        const blob = await getMediaBlob(messageId, 'message');
        if (cancelled) return;
        revokeCurrentUrl();
        if (blob) {
          const url = URL.createObjectURL(blob);
          currentUrlRef.current = url;
          setVideoUrl(url);
        } else {
          setVideoUrl(null);
        }
      } finally {
        loading = false;
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

    // Retry load after a short delay in case media arrived before we subscribed
    const retryId = setTimeout(() => {
      if (!currentUrlRef.current && !loading) load();
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(retryId);
      window.removeEventListener('dodi-media-ready', onReady);
      revokeCurrentUrl();
      setVideoUrl(null);
    };
  }, [messageId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => setError('Playback failed');

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [videoUrl]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => setError('Playback failed'));
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm">
        <span>{error}</span>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="w-full max-w-[240px] aspect-video bg-muted animate-pulse rounded-md flex items-center justify-center text-xs text-muted-foreground">
        Loading video…
      </div>
    );
  }

  return (
    <div className={cn(
      'relative w-full aspect-video rounded-md overflow-hidden bg-black/5 group transition-[max-width] duration-300',
      isPlaying ? 'max-w-[min(90vw,480px)]' : 'max-w-[280px]'
    )}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        playsInline
        muted={false}
        preload="metadata"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
          {isPlaying ? (
            <Pause className="w-7 h-7 text-foreground fill-current" />
          ) : (
            <Play className="w-7 h-7 text-foreground fill-current ml-1" />
          )}
        </div>
      </button>
    </div>
  );
}
