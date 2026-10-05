/**
 * Utility functions for PDF detection, parsing, and text reconstruction.
 */

export interface PdfTextItem {
  str: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Determines whether a URL points to or represents a PDF document.
 */
export function isPdfUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Data / Blob URLs
  if (trimmed.startsWith('data:application/pdf')) return true;
  if (trimmed.startsWith('blob:') && trimmed.toLowerCase().includes('application/pdf')) return true;

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.toLowerCase();

    // Direct .pdf path extension
    if (pathname.endsWith('.pdf')) {
      return true;
    }

    // Hash or query parameters indicating a PDF file
    if (parsed.search.toLowerCase().includes('.pdf') || parsed.hash.toLowerCase().includes('.pdf')) {
      return true;
    }
  } catch {
    // If not a standard URL, fallback to regex check on raw string
    const cleanStr = trimmed.split('?')[0].split('#')[0].toLowerCase();
    if (cleanStr.endsWith('.pdf')) {
      return true;
    }
  }

  // Check query / hash patterns
  if (/\.pdf([?#]|$)/i.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Extracts a human-readable file name from a PDF URL or path.
 */
export function getPdfFileName(url: string): string {
  if (!url) return 'document.pdf';

  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const parts = pathname.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];

    if (lastPart) {
      const decoded = decodeURIComponent(lastPart);
      if (decoded.toLowerCase().endsWith('.pdf')) {
        return decoded;
      }
      return `${decoded}.pdf`;
    }
  } catch {
    // Fallback for non-standard paths
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      try {
        return decodeURIComponent(lastPart);
      } catch {
        return lastPart;
      }
    }
  }

  return 'document.pdf';
}

/**
 * Reconstructs fragmented PDF text items into cohesive paragraphs.
 * PDF text extraction often splits text at random word or character boundaries.
 * We analyze vertical coordinates (y) and line gaps to combine sentences into paragraphs.
 */
export function reconstructPdfParagraphs(items: PdfTextItem[]): string[] {
  if (!items || items.length === 0) return [];

  const paragraphs: string[] = [];
  let currentParagraphLines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const item of items) {
    const text = item.str;
    if (!text || text.trim().length === 0) {
      continue;
    }

    const y = item.y !== undefined ? item.y : null;

    if (lastY !== null && y !== null) {
      const diffY = Math.abs(lastY - y);

      // Same line (small vertical difference, e.g. < 4px)
      if (diffY < 4) {
        if (
          currentLine.length > 0 &&
          !/\s$/.test(currentLine) &&
          !/^\s/.test(text) &&
          !/^[,.:;!?)\]}]/.test(text)
        ) {
          currentLine += ' ';
        }
        currentLine += text;
      } else {
        // Line break occurred
        if (currentLine.trim()) {
          currentParagraphLines.push(currentLine.trim());
          currentLine = '';
        }

        // Significant vertical jump (e.g. > 16px) suggests a new paragraph or section
        if (diffY > 16) {
          if (currentParagraphLines.length > 0) {
            paragraphs.push(currentParagraphLines.join(' '));
            currentParagraphLines = [];
          }
        }

        currentLine = text;
      }
    } else {
      // First item or no y-coord
      if (
        currentLine.length > 0 &&
        !/\s$/.test(currentLine) &&
        !/^\s/.test(text)
      ) {
        currentLine += ' ';
      }
      currentLine += text;
    }

    lastY = y;
  }

  if (currentLine.trim()) {
    currentParagraphLines.push(currentLine.trim());
  }

  if (currentParagraphLines.length > 0) {
    paragraphs.push(currentParagraphLines.join(' '));
  }

  return paragraphs;
}
