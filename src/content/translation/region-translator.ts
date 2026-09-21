import { NormalizedRect, scaleRectForDevicePixelRatio } from '../selection/coords';
import { isElementExcluded, findNearbyContext, EXTENSION_ROOT_ID } from '../dom/dom-utils';
import { geminiClient } from '../../services/gemini/client';
import { TranslationResult } from '../../types/translation';
import { ExtensionMessage, ExtensionResponse } from '../../types/messages';

export interface ExtractedRegionData {
  text: string;
  hasVisualMedia: boolean;
  context: string;
}

/**
 * Helper to check if two bounding boxes intersect.
 */
function rectsIntersect(
  r: DOMRect | { left: number; top: number; right: number; bottom: number },
  target: NormalizedRect
): boolean {
  return !(
    r.right <= target.left ||
    r.left >= target.right ||
    r.bottom <= target.top ||
    r.top >= target.bottom
  );
}

/**
 * Inspects elements intersecting the selected rectangle to determine whether
 * they contain normal DOM text or visual media (images, canvases, charts).
 */
export function inspectRegionContent(rect: NormalizedRect): ExtractedRegionData {
  let hasVisualMedia = false;
  let context = '';

  // 1. Check for real visual media (images, canvases, pictures, large svgs)
  const visualCandidates = document.querySelectorAll('img, canvas, picture, svg');
  for (let i = 0; i < visualCandidates.length; i++) {
    const el = visualCandidates[i];
    if (isElementExcluded(el, false)) continue;

    const elRect = el.getBoundingClientRect();
    // Ignore small icons, badges, indicators
    if (elRect.width < 32 || elRect.height < 32) continue;

    if (rectsIntersect(elRect, rect)) {
      hasVisualMedia = true;
      break;
    }
  }

  // 2. Find all text containers intersecting the selection rectangle
  const candidates = document.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, span, a, li, dt, dd, td, th, blockquote, pre, code, div, b, strong, i, em, u, mark, small, sub, sup, label, caption, section, article'
  );

  const matchedContainers = new Set<Element>();
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (isElementExcluded(el, false)) continue;

    const elRect = el.getBoundingClientRect();
    if (elRect.width === 0 || elRect.height === 0) continue;

    if (rectsIntersect(elRect, rect)) {
      matchedContainers.add(el);
      if (!context) {
        context = findNearbyContext(el);
      }
    }
  }

  // 3. Walk all text nodes inside matched containers that visually intersect the rectangle
  const textPieces: string[] = [];
  let lastBlock: Element | null = null;
  let currentBlockText = '';

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node: Node) => {
        const text = node.textContent?.trim();
        if (!text) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent || !matchedContainers.has(parent) || isElementExcluded(parent, false)) {
          return NodeFilter.FILTER_REJECT;
        }

        try {
          const range = document.createRange();
          range.selectNodeContents(node);
          const clientRects = range.getClientRects();

          if (clientRects.length === 0) {
            const bRect = range.getBoundingClientRect();
            if (bRect.width === 0 && bRect.height === 0) return NodeFilter.FILTER_REJECT;
            return rectsIntersect(bRect, rect) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }

          for (let j = 0; j < clientRects.length; j++) {
            const r = clientRects[j];
            if (r.width > 0 && r.height > 0 && rectsIntersect(r, rect)) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        } catch {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node = walker.nextNode();
  while (node) {
    const parentBlock = node.parentElement?.closest(
      'p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, pre, td, th, tr, div, article, section'
    ) || node.parentElement;

    const raw = node.textContent || '';
    const cleanPiece = raw.replace(/[\r\n\t]+/g, ' ');

    if (cleanPiece.trim()) {
      if (lastBlock && parentBlock !== lastBlock) {
        if (currentBlockText.trim()) {
          textPieces.push(currentBlockText.trim());
          currentBlockText = '';
        }
      }

      if (
        currentBlockText.length > 0 &&
        !/\s$/.test(currentBlockText) &&
        !/^\s/.test(cleanPiece) &&
        !/^[,.;:!?%\])]/.test(cleanPiece.trim())
      ) {
        currentBlockText += ' ';
      }
      currentBlockText += cleanPiece;
      lastBlock = parentBlock;
    }

    node = walker.nextNode();
  }

  if (currentBlockText.trim()) {
    textPieces.push(currentBlockText.trim());
  }

  const combinedText = textPieces.join('\n\n');

  return {
    text: combinedText,
    hasVisualMedia,
    context
  };
}

/**
 * Crops a specific region from a full viewport screenshot data URL.
 */
export async function cropViewportScreenshot(
  fullScreenshotDataUrl: string,
  rect: NormalizedRect
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const scaled = scaleRectForDevicePixelRatio(rect, dpr);

        const canvas = document.createElement('canvas');
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Failed to create canvas 2d context for screenshot crop');
        }

        ctx.drawImage(
          img,
          scaled.left,
          scaled.top,
          scaled.width,
          scaled.height,
          0,
          0,
          scaled.width,
          scaled.height
        );

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load viewport screenshot for cropping'));
    img.src = fullScreenshotDataUrl;
  });
}

/**
 * Executes the complete region translation pipeline.
 */
export async function translateRegion(rect: NormalizedRect): Promise<TranslationResult> {
  const regionData = inspectRegionContent(rect);
  const hasSubstantialText = regionData.text.trim().length >= 15;
  const isVisualTarget =
    !hasSubstantialText &&
    (regionData.hasVisualMedia || rect.width * rect.height > 8000);

  const resultId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  if (isVisualTarget) {
    // Hide extension overlays momentarily before capturing tab
    const extRoot = document.getElementById(EXTENSION_ROOT_ID);
    if (extRoot) extRoot.style.visibility = 'hidden';

    let screenshotDataUrl = '';
    try {
      const resp: ExtensionResponse<string> = await chrome.runtime.sendMessage({
        type: 'CAPTURE_VISIBLE_TAB',
        payload: { format: 'png' }
      } as ExtensionMessage);

      if (!resp.success || !resp.data) {
        throw new Error(resp.error || 'Failed to capture viewport screenshot');
      }
      screenshotDataUrl = resp.data;
    } finally {
      if (extRoot) extRoot.style.visibility = 'visible';
    }

    const croppedBase64 = await cropViewportScreenshot(screenshotDataUrl, rect);
    const aiResp = await geminiClient.translateRegionImage(croppedBase64);

    const sourceText =
      regionData.text ||
      aiResp.detectedText ||
      '[تصویر / گرافیک بصری]';

    return {
      id: resultId,
      sourceText,
      translatedText: aiResp.translation,
      sourceLanguage: aiResp.sourceLanguage,
      targetLanguage: aiResp.targetLanguage,
      explanations: aiResp.explanations || [],
      timestamp: Date.now(),
      isVisual: true
    };
  } else {
    // Standard text DOM translation
    const aiResp = await geminiClient.translateRegionText(regionData.text, {
      context: regionData.context
    });

    return {
      id: resultId,
      sourceText: regionData.text,
      translatedText: aiResp.translation,
      sourceLanguage: aiResp.sourceLanguage,
      targetLanguage: aiResp.targetLanguage,
      explanations: aiResp.explanations || [],
      timestamp: Date.now(),
      isVisual: false
    };
  }
}
