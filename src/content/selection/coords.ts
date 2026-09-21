export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): NormalizedRect {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height
  };
}

export function isMeaningfulSelection(rect: NormalizedRect, minSize = 12): boolean {
  return rect.width >= minSize && rect.height >= minSize;
}

export function viewportToDocumentRect(rect: NormalizedRect): NormalizedRect {
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  return {
    left: rect.left + scrollX,
    top: rect.top + scrollY,
    width: rect.width,
    height: rect.height,
    right: rect.right + scrollX,
    bottom: rect.bottom + scrollY
  };
}

export function scaleRectForDevicePixelRatio(rect: NormalizedRect, dpr = window.devicePixelRatio || 1): NormalizedRect {
  return {
    left: Math.round(rect.left * dpr),
    top: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
    right: Math.round(rect.right * dpr),
    bottom: Math.round(rect.bottom * dpr)
  };
}
