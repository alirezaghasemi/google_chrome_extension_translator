import { describe, it, expect } from 'vitest';
import { isPdfUrl, getPdfFileName, reconstructPdfParagraphs } from '../src/services/pdf/pdf-utils';

describe('PDF Utils', () => {
  describe('isPdfUrl', () => {
    it('should detect standard pdf urls', () => {
      expect(isPdfUrl('https://example.com/document.pdf')).toBe(true);
      expect(isPdfUrl('http://example.com/research-paper.PDF')).toBe(true);
      expect(isPdfUrl('file:///home/user/books/sample.pdf')).toBe(true);
    });

    it('should detect pdf urls with query strings and hashes', () => {
      expect(isPdfUrl('https://arxiv.org/pdf/2301.12345.pdf?download=true')).toBe(true);
      expect(isPdfUrl('https://example.com/viewer.html#page=1&file=report.pdf')).toBe(true);
      expect(isPdfUrl('https://example.com/doc.pdf#page=5')).toBe(true);
    });

    it('should detect blob and data pdf urls', () => {
      expect(isPdfUrl('blob:https://example.com/some-uuid-for-pdf#type=application/pdf')).toBe(true);
      expect(isPdfUrl('data:application/pdf;base64,JVBERi0x...')).toBe(true);
    });

    it('should reject non-pdf urls', () => {
      expect(isPdfUrl('')).toBe(false);
      expect(isPdfUrl(null)).toBe(false);
      expect(isPdfUrl(undefined)).toBe(false);
      expect(isPdfUrl('https://example.com/page.html')).toBe(false);
      expect(isPdfUrl('https://example.com/article/pdf-guide')).toBe(false);
      expect(isPdfUrl('https://example.com/image.png')).toBe(false);
    });
  });

  describe('getPdfFileName', () => {
    it('should extract filename correctly from various paths', () => {
      expect(getPdfFileName('https://example.com/deep-learning-paper.pdf')).toBe('deep-learning-paper.pdf');
      expect(getPdfFileName('https://example.com/path/doc.pdf?query=123')).toBe('doc.pdf');
      expect(getPdfFileName('file:///home/user/Documents/My%20Book.pdf')).toBe('My Book.pdf');
      expect(getPdfFileName('https://example.com/')).toBe('document.pdf');
    });
  });

  describe('reconstructPdfParagraphs', () => {
    it('should join fragmented line items into meaningful paragraphs', () => {
      const items = [
        { str: 'Natural ', y: 100 },
        { str: 'language ', y: 100 },
        { str: 'processing ', y: 100 },
        { str: 'is ', y: 90 },
        { str: 'a subfield of AI.', y: 90 },
        // Large vertical gap -> new paragraph
        { str: 'Deep learning has revolutionized', y: 50 },
        { str: ' the field of translation.', y: 40 }
      ];

      const paragraphs = reconstructPdfParagraphs(items);
      expect(paragraphs.length).toBe(2);
      expect(paragraphs[0]).toBe('Natural language processing is a subfield of AI.');
      expect(paragraphs[1]).toBe('Deep learning has revolutionized the field of translation.');
    });

    it('should filter out whitespace-only items', () => {
      const items = [
        { str: '   ', y: 100 },
        { str: 'Valid text.', y: 90 },
        { str: '   ', y: 80 }
      ];

      const paragraphs = reconstructPdfParagraphs(items);
      expect(paragraphs.length).toBe(1);
      expect(paragraphs[0]).toBe('Valid text.');
    });
  });
});
