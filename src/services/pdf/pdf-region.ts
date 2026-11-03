import { NormalizedRect, normalizeRect } from '../../content/selection/coords';
import { TranslationResult } from '../../types/translation';

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SizeBounds {
  width: number;
  height: number;
}

export interface ImageCropDimensions {
  naturalWidth: number;
  naturalHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export interface SafeCropBounds {
  cropLeft: number;
  cropTop: number;
  cropWidth: number;
  cropHeight: number;
}

/**
 * Safely computes crop rectangle from viewport selection and image dimensions,
 * guarding against 0-dimension images, division-by-zero, and out-of-bound coordinates.
 */
export function calculateSafeCropBounds(
  selection: NormalizedRect,
  imageDims: ImageCropDimensions,
  minDimension = 10
): SafeCropBounds | null {
  if (!selection || selection.width < minDimension || selection.height < minDimension) {
    return null;
  }

  const { naturalWidth, naturalHeight } = imageDims;
  if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
    return null;
  }

  const clientWidth = imageDims.clientWidth > 0 ? imageDims.clientWidth : naturalWidth;
  const clientHeight = imageDims.clientHeight > 0 ? imageDims.clientHeight : naturalHeight;

  let scaleX = naturalWidth / clientWidth;
  let scaleY = naturalHeight / clientHeight;

  if (!Number.isFinite(scaleX) || scaleX <= 0) scaleX = 1;
  if (!Number.isFinite(scaleY) || scaleY <= 0) scaleY = 1;

  const clamped = clampRectToBounds(selection, {
    width: clientWidth,
    height: clientHeight
  });

  const cropLeft = Math.max(0, Math.min(naturalWidth - 1, Math.round(clamped.left * scaleX)));
  const cropTop = Math.max(0, Math.min(naturalHeight - 1, Math.round(clamped.top * scaleY)));
  const cropWidth = Math.max(1, Math.min(naturalWidth - cropLeft, Math.round(clamped.width * scaleX)));
  const cropHeight = Math.max(1, Math.min(naturalHeight - cropTop, Math.round(clamped.height * scaleY)));

  if (cropWidth < 5 || cropHeight < 5) {
    return null;
  }

  return {
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight
  };
}

/**
 * Formats API errors and exceptions into clear, actionable Persian messages.
 */
export function formatSnipErrorMessage(err: unknown): string {
  if (!err) return 'خطای نامشخص در ترجمه ناحیه تصویری.';

  const error = err as { code?: string; httpStatus?: number; message?: string };
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  const status = error.httpStatus;

  if (code === 'MISSING_API_KEY' || msg.includes('api key is not configured') || msg.includes('missing api key')) {
    return 'کلید API جمینای تنظیم نشده است. لطفاً از بخش تنظیمات کلید خود را وارد کنید.';
  }

  if (code === 'RATE_LIMIT_EXCEEDED' || status === 429 || msg.includes('rate limit') || msg.includes('quota')) {
    return 'محدودیت تعداد درخواست جمینای (Rate Limit). لطفاً کمی صبر کنید یا در بخش تنظیمات کلیدهای بیشتری اضافه کنید.';
  }

  if (code === 'INVALID_API_KEY' || status === 401 || status === 403 || msg.includes('key not valid') || msg.includes('api key invalid')) {
    return 'کلید API وارد شده معتبر نیست یا منقضی شده است. لطفاً کلیدهای خود را در تنظیمات بررسی کنید.';
  }

  if (status === 404 || msg.includes('no longer available') || msg.includes('not found')) {
    return 'مدل قبلی منقضی شده است و به gemini-3.8-flash تغییر یافت. لطفاً مجدداً امتحان کنید.';
  }

  if (code === 'SAFETY_BLOCKED' || msg.includes('safety')) {
    return 'محتوای انتخابی توسط فیلترهای ایمنی جمینای مسدود شد.';
  }

  if (status === 503 || status === 500 || msg.includes('unavailable') || msg.includes('temporarily unavailable')) {
    return 'سرویس جمینای موقتاً با بار ترافیکی بالا مواجه است (503 Service Unavailable). لطفاً لحظاتی دیگر مجدداً تلاش کنید یا مدل دیگری را در بخش تنظیمات انتخاب کنید.';
  }

  if (code === 'TIMEOUT' || msg.includes('timeout')) {
    return 'زمان اتصال به جمینای به پایان رسید (Timeout). لطفاً اتصال اینترنت یا فیلترشکن خود را بررسی کرده و در صورت نیاز زمان تایم‌اوت را در تنظیمات افزایش دهید.';
  }

  return error.message || 'خطا در ترجمه تصویر انتخابی.';
}

/**
 * Formats paragraph translation errors into clear, actionable Persian messages.
 */
export function formatParagraphErrorMessage(err: unknown): string {
  if (!err) return 'خطای نامشخص در ترجمه پاراگراف.';

  const error = err as { code?: string; httpStatus?: number; message?: string };
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  const status = error.httpStatus;

  if (code === 'MISSING_API_KEY' || msg.includes('api key is not configured') || msg.includes('missing api key')) {
    return 'کلید API جمینای تنظیم نشده است. لطفاً از بخش تنظیمات کلید خود را وارد کنید.';
  }

  if (code === 'RATE_LIMIT_EXCEEDED' || status === 429 || msg.includes('rate limit') || msg.includes('quota')) {
    return 'محدودیت تعداد درخواست جمینای (Rate Limit). لطفاً کمی صبر کنید یا در بخش تنظیمات کلیدهای بیشتری اضافه کنید.';
  }

  if (code === 'INVALID_API_KEY' || status === 401 || status === 403 || msg.includes('key not valid') || msg.includes('api key invalid')) {
    return 'کلید API وارد شده معتبر نیست یا منقضی شده است. لطفاً کلیدهای خود را در تنظیمات بررسی کنید.';
  }

  if (status === 404 || msg.includes('no longer available') || msg.includes('not found')) {
    return 'مدل قبلی منقضی شده است و به gemini-3.8-flash تغییر یافت. لطفاً مجدداً امتحان کنید.';
  }

  if (code === 'SAFETY_BLOCKED' || msg.includes('safety')) {
    return 'محتوای پاراگراف توسط فیلترهای ایمنی جمینای مسدود شد.';
  }

  if (status === 503 || status === 500 || msg.includes('unavailable') || msg.includes('temporarily unavailable')) {
    return 'سرویس جمینای موقتاً با بار ترافیکی بالا مواجه است (503 Service Unavailable). لطفاً لحظاتی دیگر مجدداً تلاش کنید یا مدل دیگری را در بخش تنظیمات انتخاب کنید.';
  }

  if (code === 'TIMEOUT' || msg.includes('timeout') || msg.includes('timed out')) {
    return 'زمان اتصال به جمینای به پایان رسید (Timeout). لطفاً اتصال اینترنت یا فیلترشکن خود را بررسی کرده و در صورت نیاز زمان تایم‌اوت را در تنظیمات افزایش دهید.';
  }

  return error.message || 'خطا در ترجمه پاراگراف.';
}

/**
 * Clamps a selection rectangle within the bounding dimensions.
 */
export function clampRectToBounds(rect: NormalizedRect, bounds: SizeBounds): NormalizedRect {
  const left = Math.max(0, Math.min(bounds.width, rect.left));
  const top = Math.max(0, Math.min(bounds.height, rect.top));
  const right = Math.max(left, Math.min(bounds.width, rect.right));
  const bottom = Math.max(top, Math.min(bounds.height, rect.bottom));

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

/**
 * Checks whether the selection rectangle meets the minimum threshold size.
 */
export function isMeaningfulPdfSelection(rect: NormalizedRect, minDimension = 10): boolean {
  return rect.width >= minDimension && rect.height >= minDimension;
}

/**
 * Calculates coordinates relative to canvas internal pixel dimensions
 * from viewport client coordinates.
 */
export function calculateRelativeCanvasRect(
  clientSelection: NormalizedRect,
  canvasBounds: CanvasBounds,
  canvasPixelWidth: number,
  canvasPixelHeight: number
): NormalizedRect {
  const scaleX = canvasBounds.width > 0 ? canvasPixelWidth / canvasBounds.width : 1;
  const scaleY = canvasBounds.height > 0 ? canvasPixelHeight / canvasBounds.height : 1;

  const relLeft = (clientSelection.left - canvasBounds.left) * scaleX;
  const relTop = (clientSelection.top - canvasBounds.top) * scaleY;
  const relWidth = clientSelection.width * scaleX;
  const relHeight = clientSelection.height * scaleY;

  return normalizeRect(relLeft, relTop, relLeft + relWidth, relTop + relHeight);
}

/**
 * Maps a display rectangle (in canvas CSS pixels) to canvas internal bitmap pixels,
 * clamping the result to the bitmap dimensions.
 */
export function mapDisplayRectToCanvasBitmap(
  displayRect: NormalizedRect,
  displaySize: SizeBounds,
  bitmapWidth: number,
  bitmapHeight: number
): NormalizedRect {
  const scaleX = displaySize.width > 0 ? bitmapWidth / displaySize.width : 1;
  const scaleY = displaySize.height > 0 ? bitmapHeight / displaySize.height : 1;

  const left = Math.round(displayRect.left * scaleX);
  const top = Math.round(displayRect.top * scaleY);
  const width = Math.round(displayRect.width * scaleX);
  const height = Math.round(displayRect.height * scaleY);

  const rawMapped: NormalizedRect = {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };

  return clampRectToBounds(rawMapped, { width: bitmapWidth, height: bitmapHeight });
}

/**
 * Crops a region from an HTML5 canvas element and returns a base64 data URL.
 */
export function cropCanvasRegion(
  sourceCanvas: HTMLCanvasElement | null,
  rect: NormalizedRect,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95
): string | null {
  if (!sourceCanvas || rect.width <= 0 || rect.height <= 0) return null;

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(rect.width);
    offscreen.height = Math.round(rect.height);

    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
      sourceCanvas,
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
      0,
      0,
      Math.round(rect.width),
      Math.round(rect.height)
    );

    return offscreen.toDataURL(format, quality);
  } catch (err) {
    console.error('Failed to crop canvas region:', err);
    return null;
  }
}

/**
 * Transforms AI visual response into standard unified TranslationResult for FloatingPanel.
 */
export function createPdfTranslationResult(
  payload: {
    translation: string;
    detectedText?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    explanations?: Array<{ term: string; meaning: string; context?: string }>;
  },
  options: {
    sourceTextFallback?: string;
    isVisual?: boolean;
    targetLanguageFallback?: string;
  } = {}
): TranslationResult {
  return {
    id: `pdf_trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sourceText: payload.detectedText?.trim() || options.sourceTextFallback || '',
    translatedText: payload.translation,
    sourceLanguage: payload.sourceLanguage || 'en',
    targetLanguage: payload.targetLanguage || options.targetLanguageFallback || 'fa',
    explanations: payload.explanations || [],
    timestamp: Date.now(),
    isVisual: options.isVisual ?? true
  };
}

/**
 * Calculates smart viewport position for the floating panel adjacent to the selected PDF rectangle.
 */
export function calculatePdfPanelPosition(
  selectionRect: NormalizedRect,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const pad = 16;
  const gap = 16;

  // Attempt placement to the right of the selection
  let x = selectionRect.right + gap;
  let y = selectionRect.top;

  // If overflowing right, place to the left of the selection
  if (x + panelWidth > viewportWidth - pad) {
    x = selectionRect.left - panelWidth - gap;
  }

  // If still overflowing left, place below or centered
  if (x < pad) {
    x = Math.max(pad, Math.min(viewportWidth - panelWidth - pad, (viewportWidth - panelWidth) / 2));
    y = selectionRect.bottom + gap;
  }

  // Check vertical bounds
  if (y + panelHeight > viewportHeight - pad) {
    y = Math.max(pad, viewportHeight - panelHeight - pad);
  }
  if (y < pad) {
    y = pad;
  }

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}


