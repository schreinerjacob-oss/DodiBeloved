import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compresses an image file to a smaller JPEG Blob.
 * Returns Blob for efficient storage and P2P transfer.
 * 
 * @param file The original image file
 * @param maxWidth Maximum width in pixels (default: 1280px)
 * @param quality JPEG quality 0.0-1.0 (default: 0.7 = 70% quality)
 * @returns Promise<Blob> compressed image as Blob
 * 
 * @example
 * const imageFile = e.target.files[0];
 * const compressedBlob = await compressImage(imageFile);
 * console.log(`Original: ${imageFile.size}B, Compressed: ${compressedBlob.size}B`);
 * 
 * Performance: High-res photos typically reduced 70-90%
 * - 5MB JPEG → ~500KB
 * - 3MB PNG → ~300KB
 */
export type CompressPreset = 'aggressive' | 'balanced' | 'preview';
const COMPRESS_PRESETS: Record<CompressPreset, { maxWidth: number; quality: number }> = {
  aggressive: { maxWidth: 960, quality: 0.5 },
  balanced: { maxWidth: 1280, quality: 0.7 },
  preview: { maxWidth: 1280, quality: 0.7 },
};

export async function compressImage(
  file: File,
  maxWidth = 1280,
  quality = 0.7
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to Blob (not DataURL) for efficiency
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`📸 Compressed: ${file.name} (${file.size}B → ${blob.size}B, ${Math.round((1 - blob.size / file.size) * 100)}% reduction)`);
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = (err) => reject(err);
    };
    
    reader.onerror = (err) => reject(err);
  });
}

export function compressImageWithPreset(file: File, preset: CompressPreset): Promise<Blob> {
  const { maxWidth, quality } = COMPRESS_PRESETS[preset];
  return compressImage(file, maxWidth, quality);
}
