import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getMediaBlob } from '@/lib/storage';
import { Button } from '@/components/ui/button';

interface ImageFullscreenViewerProps {
  mediaId: string;
  kind: 'message' | 'memory';
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen image viewer. Loads full variant if available, falls back to preview.
 */
export function ImageFullscreenViewer({ mediaId, kind, alt = 'Image', onClose }: ImageFullscreenViewerProps) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const currentUrlRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const blob = await getMediaBlob(mediaId, kind, 'full');
      if (cancelled) return;
      if (blob) {
        const url = URL.createObjectURL(blob);
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        setImageSrc(url);
      }
    };

    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mediaId?: string; kind?: string; variant?: string } | undefined;
      if (detail?.mediaId === mediaId && detail?.kind === kind && detail?.variant === 'full') {
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
  }, [mediaId, kind]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-6 h-6" />
      </Button>
      <div className="max-w-full max-h-full p-4" onClick={(e) => e.stopPropagation()}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={alt}
            className="max-w-full max-h-[90vh] object-contain rounded-md"
          />
        ) : (
          <div className="w-64 h-64 bg-muted animate-pulse rounded-md flex items-center justify-center text-muted-foreground">
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
