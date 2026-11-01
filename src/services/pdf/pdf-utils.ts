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
 * Reconstructs fragmented PDF text items into cohesive paragraphs in visual reading order.
 * PDF text extraction often splits text into disordered stream chunks.
 * We sort top-to-bottom and left-to-right, group into visual lines,
 * and analyze vertical gaps to assemble clean paragraphs.
 */
export function reconstructPdfParagraphs(items: PdfTextItem[]): string[] {
  if (!items || items.length === 0) return [];

  // Filter out empty or whitespace-only items
  const validItems = items.filter((item) => item.str && item.str.trim().length > 0);
  if (validItems.length === 0) return [];

  // Check if we have coordinate information
  const hasCoordinates = validItems.some((item) => item.y !== undefined);

  let sortedItems = [...validItems];

  if (hasCoordinates) {
    // 1. Detect multi-column layout if present
    const xPositions = validItems
      .map((it) => (it.x !== undefined ? it.x : 0))
      .filter((x) => x > 0);

    const minX = xPositions.length > 0 ? Math.min(...xPositions) : 0;
    const maxX = xPositions.length > 0 ? Math.max(...xPositions) : 0;
    const widthSpan = maxX - minX;

    let isTwoColumn = false;
    let columnSplitX = 0;

    if (widthSpan > 320) {
      const mid = minX + widthSpan / 2;
      const leftColItems = validItems.filter((it) => (it.x ?? 0) < mid - 20);
      const rightColItems = validItems.filter((it) => (it.x ?? 0) > mid + 20);
      const centerItems = validItems.filter((it) => Math.abs((it.x ?? 0) - mid) <= 20);

      if (leftColItems.length > 5 && rightColItems.length > 5 && centerItems.length < 3) {
        isTwoColumn = true;
        columnSplitX = mid;
      }
    }

    // Sort comparator for reading order:
    // In PDF coordinates, larger y = top of page.
    // If y is within line tolerance (~4px), sort left-to-right (x ascending).
    const compareReadingOrder = (a: PdfTextItem, b: PdfTextItem) => {
      const yA = a.y ?? 0;
      const yB = b.y ?? 0;
      const diffY = yA - yB;

      if (Math.abs(diffY) <= 4) {
        const xA = a.x ?? 0;
        const xB = b.x ?? 0;
        return xA - xB;
      }

      // Descending y (top of page to bottom)
      return yB - yA;
    };

    if (isTwoColumn) {
      const col1 = validItems.filter((it) => (it.x ?? 0) < columnSplitX).sort(compareReadingOrder);
      const col2 = validItems.filter((it) => (it.x ?? 0) >= columnSplitX).sort(compareReadingOrder);
      sortedItems = [...col1, ...col2];
    } else {
      sortedItems.sort(compareReadingOrder);
    }
  }

  // 2. Group sorted items into visual lines
  interface TextLine {
    y: number;
    text: string;
  }

  const lines: TextLine[] = [];
  let currentLineItems: PdfTextItem[] = [];
  let currentLineY: number | null = null;

  for (const item of sortedItems) {
    const y = item.y !== undefined ? item.y : null;

    if (currentLineY === null || y === null) {
      currentLineItems.push(item);
      currentLineY = y;
    } else {
      const diffY = Math.abs(currentLineY - y);
      if (diffY <= 4) {
        currentLineItems.push(item);
      } else {
        if (currentLineItems.length > 0) {
          const lineText = joinLineItems(currentLineItems);
          if (lineText.trim()) {
            lines.push({
              y: currentLineY,
              text: lineText.trim()
            });
          }
        }
        currentLineItems = [item];
        currentLineY = y;
      }
    }
  }

  if (currentLineItems.length > 0 && currentLineY !== null) {
    const lineText = joinLineItems(currentLineItems);
    if (lineText.trim()) {
      lines.push({
        y: currentLineY,
        text: lineText.trim()
      });
    }
  }

  // 3. Group lines into paragraphs based on vertical line gaps and punctuation
  if (lines.length === 0) return [];

  // Calculate median line gap to detect paragraph spacing
  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap > 0 && gap < 60) {
      gaps.push(gap);
    }
  }

  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 14;
  const paragraphThreshold = Math.max(16, medianGap * 1.35);

  const paragraphs: string[] = [];
  let currentParaLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i > 0) {
      const prevLine = lines[i - 1];
      const gap = prevLine.y - line.y;

      const prevEndsWithTerminator = /[.!?:]$/.test(prevLine.text.trim());
      const isBulletOrHeading = /^([•\-*]|(\d+[\.\)])|([A-Z]\.))\s+/.test(line.text);
      const isSignificantGap = gap > paragraphThreshold;
      const isMediumGapWithPunctuation = prevEndsWithTerminator && gap > medianGap * 1.15;

      if (isSignificantGap || isMediumGapWithPunctuation || isBulletOrHeading) {
        if (currentParaLines.length > 0) {
          paragraphs.push(currentParaLines.join(' '));
          currentParaLines = [];
        }
      }
    }

    currentParaLines.push(line.text);
  }

  if (currentParaLines.length > 0) {
    paragraphs.push(currentParaLines.join(' '));
  }

  return paragraphs;
}

/**
 * Helper to join text items on the same line with natural spacing.
 */
function joinLineItems(items: PdfTextItem[]): string {
  let line = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = item.str;

    if (i > 0) {
      const endsWithSpace = /\s$/.test(line);
      const startsWithSpace = /^\s/.test(text);
      const isPunctuation = /^[,.:;!?%)\]}]/.test(text.trim());

      if (!endsWithSpace && !startsWithSpace && !isPunctuation) {
        line += ' ';
      }
    }
    line += text;
  }
  return line;
}
