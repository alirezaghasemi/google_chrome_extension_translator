import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geminiClient } from '../src/services/gemini/client';
import { storageService } from '../src/services/storage/storage-service';
import { GeminiApiError } from '../src/services/gemini/errors';
import { calculateSafeCropBounds, formatSnipErrorMessage } from '../src/services/pdf/pdf-region';

import { DEFAULT_SETTINGS } from '../src/services/storage/defaults';

describe('PDF Snip Robustness & Multimodal Fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateSafeCropBounds', () => {
    it('should safely calculate crop bounds even when clientWidth or clientHeight is 0 or unmeasured', () => {
      const selection = { left: 10, top: 20, right: 110, bottom: 120, width: 100, height: 100 };
      const bounds = calculateSafeCropBounds(selection, {
        naturalWidth: 800,
        naturalHeight: 600,
        clientWidth: 0,
        clientHeight: 0
      });

      expect(bounds).not.toBeNull();
      expect(Number.isFinite(bounds!.cropLeft)).toBe(true);
      expect(Number.isFinite(bounds!.cropTop)).toBe(true);
      expect(Number.isFinite(bounds!.cropWidth)).toBe(true);
      expect(Number.isFinite(bounds!.cropHeight)).toBe(true);
      expect(bounds!.cropWidth).toBeGreaterThan(0);
      expect(bounds!.cropHeight).toBeGreaterThan(0);
    });

    it('should clamp crop bounds to natural dimensions without overflowing', () => {
      const selection = { left: 700, top: 500, right: 1000, bottom: 800, width: 300, height: 300 };
      const bounds = calculateSafeCropBounds(selection, {
        naturalWidth: 800,
        naturalHeight: 600,
        clientWidth: 800,
        clientHeight: 600
      });

      expect(bounds).not.toBeNull();
      expect(bounds!.cropLeft + bounds!.cropWidth).toBeLessThanOrEqual(800);
      expect(bounds!.cropTop + bounds!.cropHeight).toBeLessThanOrEqual(600);
    });

    it('should return null for micro or invalid selections', () => {
      const micro = { left: 10, top: 10, right: 12, bottom: 12, width: 2, height: 2 };
      const bounds = calculateSafeCropBounds(micro, {
        naturalWidth: 800,
        naturalHeight: 600,
        clientWidth: 800,
        clientHeight: 600
      });

      expect(bounds).toBeNull();
    });
  });

  describe('formatSnipErrorMessage', () => {
    it('should format missing API key into clear Persian guidance', () => {
      const err = new GeminiApiError('Gemini API key is not configured.', 'MISSING_API_KEY');
      const msg = formatSnipErrorMessage(err);
      expect(msg).toContain('کلید API');
      expect(msg).toContain('تنظیمات');
    });

    it('should format rate limit into Persian advice', () => {
      const err = new GeminiApiError('Gemini API rate limit exceeded.', 'RATE_LIMIT_EXCEEDED', 429);
      const msg = formatSnipErrorMessage(err);
      expect(msg).toContain('محدودیت');
    });

    it('should format invalid API key into Persian advice', () => {
      const err = new GeminiApiError('Invalid API key.', 'INVALID_API_KEY', 400);
      const msg = formatSnipErrorMessage(err);
      expect(msg).toContain('معتبر نیست');
    });
  });

  describe('Multimodal Schema Fallback in translateRegionImage', () => {
    it('should fall back to prompt-only JSON mode if schema-based multimodal request returns 400', async () => {
      vi.spyOn(storageService, 'getSettings').mockResolvedValue({
        ...DEFAULT_SETTINGS,
        geminiApiKey: 'TEST_KEY_MULTIMODAL',
        geminiApiKeys: ['TEST_KEY_MULTIMODAL'],
        geminiModel: 'gemini-3.8-flash'
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
        callCount++;
        const body = JSON.parse(options.body);

        // First attempt with responseSchema fails with 400
        if (body.generationConfig?.responseSchema) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                code: 400,
                message: 'Invalid JSON schema with multimodal payload',
                status: 'INVALID_ARGUMENT'
              }
            })
          };
        }

        // Fallback attempt succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        sourceLanguage: 'en',
                        targetLanguage: 'fa',
                        detectedText: 'Sample Extracted Text',
                        translation: 'متن استخراج‌شده نمونه',
                        explanations: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      });

      const result = await geminiClient.translateRegionImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      expect(result.translation).toBe('متن استخراج‌شده نمونه');
      expect(result.detectedText).toBe('Sample Extracted Text');
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
