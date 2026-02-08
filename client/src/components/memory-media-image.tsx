import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { getMediaBlob } from '@/lib/storage';

export function MemoryMediaImage({ memoryId, mediaType }: { memoryId: string; mediaType?: 'image' | 'video' | 'photo' }) {
  const [mediaSrc, setMediaSrc] = useState<string>('');
  const [isVideo, setIsVideo] = useState<boolean>(mediaType === 'video');
  const currentUrlRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    setIsVideo(mediaType === 'video');

    const load = async () => {
      const blob = await getMediaBlob(memoryId, 'memory', 'preview');
      if (cancelled) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        setMediaSrc(url);
        // When mediaType is unknown (e.g. legacy memories), infer from blob MIME type
        if (mediaType === undefined) {
          setIsVideo(typeof blob.type === 'string' && blob.type.startsWith('video/'));
        }
      }
    };

    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mediaId?: string; kind?: string } | undefined;
      if (detail?.mediaId === memoryId && detail?.kind === 'memory') {
        load();
      }
    };

    load();
    window.addEventListener('dodi-media-ready', onReady);

    return () => {
      cancelled = true;
      window.removeEventListener('dodi-media-ready', onReady);
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = '';
    };
  }, [memoryId, mediaType]);

  if (!mediaSrc) {
    return (
      <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="relative w-full h-full bg-black">
        <video
          src={mediaSrc}
          className="w-full h-full object-cover"
          muted
          playsInline
          preload="metadata"
          data-testid={`memory-video-${memoryId}`}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-6 h-6 text-foreground fill-current ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={mediaSrc}
      alt="Memory"
      className="w-full h-full object-cover"
      data-testid={`memory-image-${memoryId}`}
    />
  );
}
