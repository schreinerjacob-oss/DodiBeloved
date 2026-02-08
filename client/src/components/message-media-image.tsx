import { useEffect, useRef, useState } from 'react';
import { getMediaBlob } from '@/lib/storage';

export function MessageMediaImage({ messageId, fileName }: { messageId: string; fileName: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const currentUrlRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    let loading = false;

    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const blob = await getMediaBlob(messageId, 'message', 'preview');
        if (cancelled) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
          currentUrlRef.current = url;
          setImageSrc(url);
        }
      } finally {
        loading = false;
      }
    };

    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mediaId?: string; kind?: string; variant?: string } | undefined;
      if (detail?.mediaId === messageId && detail?.kind === 'message') {
        load();
      }
    };

    load();
    window.addEventListener('dodi-media-ready', onReady);

    // Retry load after a short delay in case media arrived before we subscribed to dodi-media-ready
    const retryId = setTimeout(() => {
      if (!currentUrlRef.current && !loading) load();
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(retryId);
      window.removeEventListener('dodi-media-ready', onReady);
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = '';
    };
  }, [messageId]);

  return imageSrc ? (
    <img
      src={imageSrc}
      alt={fileName}
      className="w-full h-auto rounded-md"
      data-testid="message-image"
    />
  ) : (
    <div className="w-full h-32 bg-muted animate-pulse rounded-md flex items-center justify-center text-xs text-muted-foreground">
      Loading image…
    </div>
  );
}
