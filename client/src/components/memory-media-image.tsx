import { useEffect, useRef, useState } from 'react';
import { getMediaBlob } from '@/lib/storage';

export function MemoryMediaImage({ memoryId }: { memoryId: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const currentUrlRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const blob = await getMediaBlob(memoryId, 'memory', 'preview');
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
  }, [memoryId]);

  return imageSrc ? (
    <img
      src={imageSrc}
      alt="Memory"
      className="w-full h-full object-cover"
      data-testid={`memory-image-${memoryId}`}
    />
  ) : (
    <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center text-xs text-muted-foreground">
      Loading…
    </div>
  );
}
