import { describe, it, expect } from 'vitest';
import { PdfDocumentTranslator } from '../src/services/pdf/pdf-translator-service';

describe('PdfDocumentTranslator', () => {
  it('should initialize with idle status', () => {
    const translator = new PdfDocumentTranslator();
    const state = translator.getState();

    expect(state.status).toBe('idle');
    expect(state.currentPage).toBe(0);
    expect(state.totalPages).toBe(0);
    expect(state.progressPercent).toBe(0);
  });

  it('should calculate progress percentage accurately', () => {
    const translator = new PdfDocumentTranslator();
    translator.setTotalPages(10);
    translator.setCurrentPage(5);

    const state = translator.getState();
    expect(state.totalPages).toBe(10);
    expect(state.currentPage).toBe(5);
    expect(state.progressPercent).toBe(50);
  });

  it('should store and retrieve page translations', () => {
    const translator = new PdfDocumentTranslator();
    translator.setPageTranslation(1, {
      pageNumber: 1,
      originalParagraphs: ['Hello world', 'Artificial intelligence in healthcare'],
      translatedParagraphs: ['سلام دنیا', 'هوش مصنوعی در سلامت'],
      targetLanguage: 'fa'
    });

    const page1 = translator.getPageTranslation(1);
    expect(page1).toBeDefined();
    expect(page1?.translatedParagraphs.length).toBe(2);
    expect(page1?.translatedParagraphs[0]).toBe('سلام دنیا');
    expect(translator.hasPageTranslation(1)).toBe(true);
    expect(translator.hasPageTranslation(2)).toBe(false);
  });

  it('should clear stored translations on reset', () => {
    const translator = new PdfDocumentTranslator();
    translator.setPageTranslation(1, {
      pageNumber: 1,
      originalParagraphs: ['Text'],
      translatedParagraphs: ['متن'],
      targetLanguage: 'fa'
    });

    translator.reset();
    expect(translator.getState().status).toBe('idle');
    expect(translator.hasPageTranslation(1)).toBe(false);
  });
});
