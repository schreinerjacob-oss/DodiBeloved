import { useEffect, useState } from 'react';
import { getMediaBlob } from '@/lib/storage';

export function MessageMediaImage({ messageId, fileName }: { messageId: string; fileName: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    (async () => {
      const blob = await getMediaBlob(messageId, 'message');
      if (blob) {
        setImageSrc(URL.createObjectURL(blob));
      }
    })();

    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
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
    <div className="w-full h-32 bg-muted animate-pulse rounded-md" />
  );
}
