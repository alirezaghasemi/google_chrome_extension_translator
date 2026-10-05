import { describe, it, expect, beforeEach } from 'vitest';
import { isPdfUrl, reconstructPdfParagraphs } from '../src/services/pdf/pdf-utils';
import { pdfDocumentTranslator } from '../src/services/pdf/pdf-translator-service';
import { createTranslationBatches } from '../src/services/translation/chunker';

describe('PDF Integration and Workflow', () => {
  beforeEach(() => {
    pdfDocumentTranslator.reset();
  });

  it('should detect various browser PDF presentation formats', () => {
    // Standard web hosted PDF
    expect(isPdfUrl('https://arxiv.org/pdf/2401.00001.pdf')).toBe(true);
    // Local file viewer
    expect(isPdfUrl('file:///home/user/Downloads/deeplearning.pdf')).toBe(true);
    // Query params or direct download links
    expect(isPdfUrl('https://example.com/api/get_file?name=report.pdf&auth=xyz')).toBe(true);
    // Blob PDF
    expect(isPdfUrl('blob:https://example.com/a9c1e7-application/pdf')).toBe(true);
  });

  it('should process multi-page PDF paragraph extraction and chunking for Gemini', () => {
    const rawItemsPage1 = [
      { str: 'Abstract: This paper introduces a new neural architecture.', y: 200 },
      { str: 'Modern language models rely heavily on transformers.', y: 190 },
      // Section gap
      { str: '1. Introduction', y: 140 },
      { str: 'Natural language understanding has progressed rapidly.', y: 130 }
    ];

    const paragraphs = reconstructPdfParagraphs(rawItemsPage1);
    expect(paragraphs.length).toBe(2);

    // Turn paragraphs into Gemini batches
    const chunks = paragraphs.map((text, idx) => ({ text, nodeIndex: idx }));
    const batches = createTranslationBatches(chunks, {
      maxItemsPerBatch: 5,
      maxCharsPerBatch: 1000
    });

    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(2);
    expect(batches[0][0].text).toContain('Abstract');
    expect(batches[0][1].text).toContain('1. Introduction');
  });

  it('should manage document translation lifecycle across multiple pages', () => {
    pdfDocumentTranslator.setTotalPages(3);
    expect(pdfDocumentTranslator.getState().totalPages).toBe(3);
    expect(pdfDocumentTranslator.getState().status).toBe('idle');

    // Page 1 translated
    pdfDocumentTranslator.setPageTranslation(1, {
      pageNumber: 1,
      originalParagraphs: ['Hello'],
      translatedParagraphs: ['سلام'],
      targetLanguage: 'fa'
    });
    pdfDocumentTranslator.setCurrentPage(1);
    expect(pdfDocumentTranslator.getState().progressPercent).toBe(33);

    // Page 2 translated
    pdfDocumentTranslator.setPageTranslation(2, {
      pageNumber: 2,
      originalParagraphs: ['World'],
      translatedParagraphs: ['جهان'],
      targetLanguage: 'fa'
    });
    pdfDocumentTranslator.setCurrentPage(2);
    expect(pdfDocumentTranslator.getState().progressPercent).toBe(67);

    // Page 3 translated
    pdfDocumentTranslator.setPageTranslation(3, {
      pageNumber: 3,
      originalParagraphs: ['Complete'],
      translatedParagraphs: ['تکمیل شد'],
      targetLanguage: 'fa'
    });
    pdfDocumentTranslator.setCurrentPage(3);
    expect(pdfDocumentTranslator.getState().progressPercent).toBe(100);

    const all = pdfDocumentTranslator.getAllTranslations();
    expect(all.size).toBe(3);
    expect(all.get(1)?.translatedParagraphs[0]).toBe('سلام');
    expect(all.get(2)?.translatedParagraphs[0]).toBe('جهان');
    expect(all.get(3)?.translatedParagraphs[0]).toBe('تکمیل شد');
  });
});
