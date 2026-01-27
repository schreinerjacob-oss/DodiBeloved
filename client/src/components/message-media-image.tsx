import { useEffect, useRef, useState } from 'react';
import { getMediaBlob } from '@/lib/storage';

export function MessageMediaImage({ messageId, fileName }: { messageId: string; fileName: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const currentUrlRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const blob = await getMediaBlob(messageId, 'message');
      if (cancelled) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        // Revoke the previous URL (if any) before swapping
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        setImageSrc(url);
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
