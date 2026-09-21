import { CaptureSlice, FullPageProgress, ScreenshotResult } from '../../types/screenshot';
import { storageService } from '../../services/storage/storage-service';
import { stitchSlices } from '../../services/screenshot/stitcher';
import { EXTENSION_ROOT_ID } from '../dom/dom-utils';
import { ExtensionMessage, ExtensionResponse } from '../../types/messages';

export type FullPageProgressCallback = (progress: FullPageProgress) => void;

interface HiddenElementRecord {
  element: HTMLElement;
  originalVisibility: string;
}

export class FullPageCapturer {
  private static instance: FullPageCapturer;

  public static getInstance(): FullPageCapturer {
    if (!FullPageCapturer.instance) {
      FullPageCapturer.instance = new FullPageCapturer();
    }
    return FullPageCapturer.instance;
  }

  /**
   * Finds sticky and fixed elements in the document to prevent repetitive stamping.
   */
  private findStickyElements(): HTMLElement[] {
    const stickyEls: HTMLElement[] = [];
    const all = document.querySelectorAll('*');

    for (let i = 0; i < all.length; i++) {
      const el = all[i] as HTMLElement;
      if (el.id === EXTENSION_ROOT_ID) continue;

      try {
        const pos = window.getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') {
          stickyEls.push(el);
        }
      } catch {
        // Skip un-computable elements
      }
    }

    return stickyEls;
  }

  /**
   * Coordinates the full page progressive scroll, capture, and stitch workflow.
   */
  public async captureFullPage(
    onProgress?: FullPageProgressCallback
  ): Promise<ScreenshotResult> {
    const settings = await storageService.getSettings();
    const delay = settings.fullPageCaptureDelay || 350;
    const dpr = window.devicePixelRatio || 1;

    const initialX = window.scrollX || window.pageXOffset;
    const initialY = window.scrollY || window.pageYOffset;

    const totalHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight
    );

    const totalWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth
    );

    const viewportHeight = window.innerHeight;
    const slices: CaptureSlice[] = [];
    const stickyElements = this.findStickyElements();
    const hiddenStickyRecords: HiddenElementRecord[] = [];

    // Hide extension root during captures
    const extRoot = document.getElementById(EXTENSION_ROOT_ID);
    if (extRoot) extRoot.style.visibility = 'hidden';

    try {
      const scrollPositions: number[] = [];
      let y = 0;
      while (y < totalHeight) {
        scrollPositions.push(y);
        y += viewportHeight;
        if (y >= totalHeight && y - viewportHeight < totalHeight - 5) {
          // Adjust last slice to capture exact bottom without exceeding bounds
          const lastY = Math.max(0, totalHeight - viewportHeight);
          if (scrollPositions[scrollPositions.length - 1] !== lastY) {
            scrollPositions.push(lastY);
          }
          break;
        }
      }

      // Remove duplicates
      const uniquePositions = Array.from(new Set(scrollPositions));
      const totalSlices = uniquePositions.length;

      for (let i = 0; i < totalSlices; i++) {
        const scrollY = uniquePositions[i];
        window.scrollTo(0, scrollY);

        if (onProgress) {
          onProgress({
            currentSlice: i + 1,
            totalSlices,
            percentage: Math.round(((i + 1) / totalSlices) * 80),
            status: 'capturing'
          });
        }

        // Wait for rendering & smooth scroll stabilization
        await new Promise((r) => setTimeout(r, delay));

        // After the first top slice, hide fixed/sticky elements to avoid duplication
        if (i === 1) {
          for (const el of stickyElements) {
            hiddenStickyRecords.push({
              element: el,
              originalVisibility: el.style.visibility
            });
            el.style.visibility = 'hidden';
          }
        }

        // Capture visible tab via background worker
        const resp: ExtensionResponse<string> = await chrome.runtime.sendMessage({
          type: 'CAPTURE_VISIBLE_TAB',
          payload: {
            format: settings.screenshotFormat,
            quality: settings.screenshotQuality
          }
        } as ExtensionMessage);

        if (!resp.success || !resp.data) {
          throw new Error(resp.error || `Failed to capture slice ${i + 1}`);
        }

        slices.push({
          index: i,
          scrollX: 0,
          scrollY,
          dataUrl: resp.data
        });
      }

      if (onProgress) {
        onProgress({
          currentSlice: totalSlices,
          totalSlices,
          percentage: 90,
          status: 'stitching'
        });
      }

      // Stitch all captured slices
      const result = await stitchSlices(
        slices,
        totalWidth,
        totalHeight,
        dpr,
        settings.screenshotFormat,
        settings.screenshotQuality
      );

      if (onProgress) {
        onProgress({
          currentSlice: totalSlices,
          totalSlices,
          percentage: 100,
          status: 'completed'
        });
      }

      return result;
    } finally {
      // Restore sticky elements
      for (const record of hiddenStickyRecords) {
        record.element.style.visibility = record.originalVisibility;
      }

      // Restore scroll position
      if (settings.autoRestoreScroll) {
        window.scrollTo(initialX, initialY);
      }

      // Restore extension UI
      if (extRoot) extRoot.style.visibility = 'visible';
    }
  }
}

export const fullPageCapturer = FullPageCapturer.getInstance();
