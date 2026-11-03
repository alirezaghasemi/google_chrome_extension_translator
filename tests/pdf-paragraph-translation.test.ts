import { describe, it, expect } from 'vitest';
import { PdfDocumentTranslator } from '../src/services/pdf/pdf-translator-service';

describe('PDF Paragraph-level Translation (User Selection Mode)', () => {
  it('should allow translating a specific paragraph individually without requiring full page translation', () => {
    const translator = new PdfDocumentTranslator();
    const originalParas = [
      'First paragraph with background info.',
      'Second paragraph that the user wants to translate specifically.',
      'Third paragraph that should remain untranslated for now.'
    ];

    // User chooses to translate only paragraph index 1
    const result = translator.setParagraphTranslation(
      1,
      1,
      originalParas,
      'پاراگراف دوم که کاربر به طور خاص می‌خواهد ترجمه کند.',
      'fa'
    );

    expect(result.translatedParagraphs[1]).toBe('پاراگراف دوم که کاربر به طور خاص می‌خواهد ترجمه کند.');
    expect(result.translatedParagraphs[0]).toBeFalsy();
    expect(result.translatedParagraphs[2]).toBeFalsy();

    // Verify stored page translation
    const page1 = translator.getPageTranslation(1);
    expect(page1).toBeDefined();
    expect(page1?.translatedParagraphs[1]).toBe('پاراگراف دوم که کاربر به طور خاص می‌خواهد ترجمه کند.');
  });

  it('should preserve previously translated paragraphs when translating another paragraph on the same page', () => {
    const translator = new PdfDocumentTranslator();
    const originalParas = ['Para 0', 'Para 1', 'Para 2'];

    // Translate Para 0
    translator.setParagraphTranslation(1, 0, originalParas, 'ترجمه پاراگراف صفر', 'fa');
    // Translate Para 2
    const updated = translator.setParagraphTranslation(1, 2, originalParas, 'ترجمه پاراگراف دو', 'fa');

    expect(updated.translatedParagraphs[0]).toBe('ترجمه پاراگراف صفر');
    expect(updated.translatedParagraphs[1]).toBeFalsy();
    expect(updated.translatedParagraphs[2]).toBe('ترجمه پاراگراف دو');
  });

  it('should support geminiClient.translateParagraph without schema or explanation token overhead', async () => {
    const { geminiClient } = await import('../src/services/gemini/client');
    const { storageService } = await import('../src/services/storage/storage-service');

    await storageService.saveSettings({
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-3.8-flash',
      requestTimeout: 30000
    });

    let sentBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, options: any) => {
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'این یک ترجمه مستقیم پاراگراف است.' }]
              }
            }
          ]
        })
      };
    }) as unknown as typeof fetch;

    const res = await geminiClient.translateParagraph('This is a direct paragraph translation.', {
      targetLanguage: 'fa'
    });

    expect(res).toBe('این یک ترجمه مستقیم پاراگراف است.');
    expect(sentBody).not.toBeNull();
    // Verify no responseSchema is sent, avoiding heavy constrained decoding token generation
    expect(sentBody.generationConfig?.responseSchema).toBeUndefined();
    expect(sentBody.generationConfig?.responseMimeType).toBeUndefined();
  });

  it('should format paragraph translation timeout into actionable Persian guidance', async () => {
    const { formatParagraphErrorMessage } = await import('../src/services/pdf/pdf-region');
    const { GeminiApiError } = await import('../src/services/gemini/errors');

    const timeoutErr = new GeminiApiError('Gemini request timed out after 30s.', 'TIMEOUT');
    const msg = formatParagraphErrorMessage(timeoutErr);

    expect(msg).toContain('پایان رسید');
    expect(msg).toContain('اینترنت');
    expect(msg).toContain('تنظیمات');
  });
});

