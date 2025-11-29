import { useEffect, useState } from 'react';
import { getMediaBlob } from '@/lib/storage';

export function MemoryMediaImage({ memoryId }: { memoryId: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    (async () => {
      const blob = await getMediaBlob(memoryId, 'memory');
      if (blob) {
        setImageSrc(URL.createObjectURL(blob));
      }
    })();

    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
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
    <div className="w-full h-full bg-muted animate-pulse" />
  );
}
