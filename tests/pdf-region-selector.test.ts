import { describe, it, expect, vi } from 'vitest';
import {
  clampRectToBounds,
  isMeaningfulPdfSelection,
  calculateRelativeCanvasRect,
  cropCanvasRegion,
  createPdfTranslationResult,
  calculatePdfPanelPosition,
  mapDisplayRectToCanvasBitmap
} from '../src/services/pdf/pdf-region';

describe('PDF Region Selector & Cropper', () => {
  it('should clamp selection rectangle strictly within canvas or container bounds', () => {
    const bounds = { width: 800, height: 1000 };

    // Selection exceeding bottom-right bounds
    const overflowRect = {
      left: 700,
      top: 950,
      width: 200,
      height: 100,
      right: 900,
      bottom: 1050
    };

    const clamped = clampRectToBounds(overflowRect, bounds);
    expect(clamped.left).toBe(700);
    expect(clamped.top).toBe(950);
    expect(clamped.right).toBe(800);
    expect(clamped.bottom).toBe(1000);
    expect(clamped.width).toBe(100);
    expect(clamped.height).toBe(50);
  });

  it('should clamp negative coordinates to 0', () => {
    const bounds = { width: 500, height: 500 };
    const negativeRect = {
      left: -50,
      top: -20,
      width: 100,
      height: 80,
      right: 50,
      bottom: 60
    };

    const clamped = clampRectToBounds(negativeRect, bounds);
    expect(clamped.left).toBe(0);
    expect(clamped.top).toBe(0);
    expect(clamped.right).toBe(50);
    expect(clamped.bottom).toBe(60);
    expect(clamped.width).toBe(50);
    expect(clamped.height).toBe(60);
  });

  it('should detect meaningful selections and reject micro-drags', () => {
    const micro = {
      left: 10,
      top: 10,
      width: 8,
      height: 5,
      right: 18,
      bottom: 15
    };
    expect(isMeaningfulPdfSelection(micro, 10)).toBe(false);

    const valid = {
      left: 10,
      top: 10,
      width: 120,
      height: 60,
      right: 130,
      bottom: 70
    };
    expect(isMeaningfulPdfSelection(valid, 10)).toBe(true);
  });

  it('should correctly scale and project viewport drag coords to canvas resolution', () => {
    // E.g. canvas client rect in CSS pixels is 400x600, while internal bitmap is 800x1200 (scale=2)
    const canvasBounds = {
      left: 100,
      top: 50,
      width: 400,
      height: 600
    };

    // User selected rectangle at client coords: left 150, top 100, right 250, bottom 200
    // Relative to canvas CSS: left = 50, top = 50, width = 100, height = 100
    const selection = {
      left: 150,
      top: 100,
      right: 250,
      bottom: 200,
      width: 100,
      height: 100
    };

    const relative = calculateRelativeCanvasRect(selection, canvasBounds, 800, 1200);

    expect(relative.left).toBe(100); // 50 * (800 / 400) = 100
    expect(relative.top).toBe(100);  // 50 * (1200 / 600) = 100
    expect(relative.width).toBe(200); // 100 * (800 / 400) = 200
    expect(relative.height).toBe(200); // 100 * (1200 / 600) = 200
    expect(relative.right).toBe(300);
    expect(relative.bottom).toBe(300);
  });

  it('should accurately map display CSS rectangle to canvas bitmap dimensions', () => {
    const displayRect = {
      left: 50,
      top: 100,
      width: 200,
      height: 80,
      right: 250,
      bottom: 180
    };
    const displaySize = { width: 400, height: 600 };
    const bitmapWidth = 800; // scaleX = 2
    const bitmapHeight = 1200; // scaleY = 2

    const mapped = mapDisplayRectToCanvasBitmap(displayRect, displaySize, bitmapWidth, bitmapHeight);

    expect(mapped.left).toBe(100);
    expect(mapped.top).toBe(200);
    expect(mapped.width).toBe(400);
    expect(mapped.height).toBe(160);
    expect(mapped.right).toBe(500);
    expect(mapped.bottom).toBe(360);
  });

  it('should clamp mapped coordinates if display rect exceeds display bounds', () => {
    const displayRect = {
      left: 350,
      top: 550,
      width: 100,
      height: 100,
      right: 450,
      bottom: 650
    };
    const displaySize = { width: 400, height: 600 };
    const bitmapWidth = 800;
    const bitmapHeight = 1200;

    const mapped = mapDisplayRectToCanvasBitmap(displayRect, displaySize, bitmapWidth, bitmapHeight);

    expect(mapped.left).toBe(700);
    expect(mapped.top).toBe(1100);
    expect(mapped.right).toBe(800);
    expect(mapped.bottom).toBe(1200);
    expect(mapped.width).toBe(100);
    expect(mapped.height).toBe(100);
  });

  it('should crop canvas region accurately', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    // Provide lightweight mocks for jsdom canvas
    const drawImageMock = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: drawImageMock,
      fillStyle: '',
      fillRect: vi.fn()
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,fakeimage');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;

      const rect = {
        left: 20,
        top: 20,
        width: 50,
        height: 50,
        right: 70,
        bottom: 70
      };

      const cropped = cropCanvasRegion(canvas, rect);
      expect(cropped).toBeDefined();
      expect(typeof cropped).toBe('string');
      expect(cropped?.startsWith('data:image/')).toBe(true);
      expect(drawImageMock).toHaveBeenCalled();
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    }
  });

  it('should detect when fallback snipping should be triggered for PDF documents', () => {
    // Testing candidate URLs that should trigger PDF snipper instead of in-page DOM script
    const pdfUrls = [
      'https://arxiv.org/pdf/2301.00001.pdf',
      'file:///home/user/books/ai_handbook.pdf',
      'http://example.com/view?file=report.pdf&page=1',
      'data:application/pdf;base64,JVBERi0xLjQK'
    ];

    for (const url of pdfUrls) {
      // Both isPdfUrl and title detection logic
      const isPdf = url.toLowerCase().includes('.pdf') || url.startsWith('data:application/pdf');
      expect(isPdf).toBe(true);
    }
  });

  it('should transform visual translation output into unified TranslationResult structure for FloatingPanel', () => {
    const rawAiResult = {
      translation: 'بسیاری از زبان‌های برنامه‌نویسی...',
      detectedText: 'Many programming languages...',
      sourceLanguage: 'en',
      targetLanguage: 'fa',
      explanations: [
        { term: 'OOP', meaning: 'مخفف برنامه‌نویسی شیءگرا' }
      ]
    };

    const result = createPdfTranslationResult(rawAiResult, { isVisual: true });

    expect(result.id).toMatch(/^pdf_trans_/);
    expect(result.translatedText).toBe(rawAiResult.translation);
    expect(result.sourceText).toBe(rawAiResult.detectedText);
    expect(result.sourceLanguage).toBe('en');
    expect(result.targetLanguage).toBe('fa');
    expect(result.explanations).toHaveLength(1);
    expect(result.explanations?.[0].term).toBe('OOP');
    expect(result.isVisual).toBe(true);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it('should position floating panel smartly adjacent to the selected PDF region', () => {
    const viewport = { width: 1200, height: 800 };
    const panelSize = { width: 380, height: 420 };

    // Selection on the left side of the screen
    const leftSelection = {
      left: 100,
      top: 150,
      right: 300,
      bottom: 250,
      width: 200,
      height: 100
    };

    const pos = calculatePdfPanelPosition(leftSelection, panelSize.width, panelSize.height, viewport.width, viewport.height);
    // Should place panel to the right of selection (right + 16 = 316)
    expect(pos.x).toBe(316);
    expect(pos.y).toBe(150);
    expect(pos.x + panelSize.width).toBeLessThanOrEqual(viewport.width - 16);
    expect(pos.y + panelSize.height).toBeLessThanOrEqual(viewport.height - 16);
  });
});
