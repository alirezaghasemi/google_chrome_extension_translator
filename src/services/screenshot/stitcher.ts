import { CaptureSlice, ScreenshotResult } from '../../types/screenshot';
import { ScreenshotFormat } from '../../types/settings';

export async function stitchSlices(
  slices: CaptureSlice[],
  totalWidth: number,
  totalHeight: number,
  dpr: number,
  format: ScreenshotFormat = 'png',
  quality = 0.92
): Promise<ScreenshotResult> {
  const canvas = document.createElement('canvas');
  const targetWidth = Math.round(totalWidth * dpr);
  const targetHeight = Math.round(totalHeight * dpr);

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to obtain canvas 2D rendering context');
  }

  // White background for JPEG exports
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  for (const slice of slices) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const destY = Math.round(slice.scrollY * dpr);
          ctx.drawImage(img, 0, destY);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error(`Failed to load slice #${slice.index} for stitching`));
      img.src = slice.dataUrl;
    });
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, quality);

  return {
    dataUrl,
    format,
    width: targetWidth,
    height: targetHeight,
    timestamp: Date.now()
  };
}
