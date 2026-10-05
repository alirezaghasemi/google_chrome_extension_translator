import * as pdfjsLib from 'pdfjs-dist';
import { reconstructPdfParagraphs, PdfTextItem } from './pdf-utils';
import { geminiClient } from '../gemini/client';
import { storageService } from '../storage/storage-service';
import { PageTranslationResult } from './pdf-translator-service';
import { TranslationChunk } from '../../types/translation';

// Initialize worker in browser environments
if (typeof window !== 'undefined') {
  try {
    const workerUrl = chrome?.runtime?.getURL
      ? chrome.runtime.getURL('pdf.worker.min.mjs')
      : '/pdf.worker.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Fallback if chrome.runtime is unavailable
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
}

export class PdfLoader {
  private pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  private title: string = '';

  public getTitle(): string {
    return this.title;
  }

  /**
   * Loads a PDF document from a URL (http/https/blob/data) or ArrayBuffer / Uint8Array.
   */
  public async loadDocument(
    source: string | ArrayBuffer | Uint8Array,
    name = 'document.pdf'
  ): Promise<{ numPages: number; title: string }> {
    this.title = name;

    const loadingTask = typeof source === 'string'
      ? pdfjsLib.getDocument({ url: source })
      : pdfjsLib.getDocument({ data: source });

    this.pdfDoc = await loadingTask.promise;

    let docTitle = name;
    try {
      const meta = await this.pdfDoc.getMetadata();
      const info = meta?.info as { Title?: string };
      if (info?.Title && info.Title.trim().length > 0) {
        docTitle = info.Title.trim();
      }
    } catch {
      // Ignore metadata parsing error
    }

    this.title = docTitle;

    return {
      numPages: this.pdfDoc.numPages,
      title: docTitle
    };
  }

  public getNumPages(): number {
    return this.pdfDoc?.numPages || 0;
  }

  /**
   * Extracts clean text paragraphs from a given 1-indexed page.
   */
  public async extractPageParagraphs(pageNumber: number): Promise<string[]> {
    if (!this.pdfDoc) {
      throw new Error('PDF document is not loaded.');
    }

    const page = await this.pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const item of textContent.items) {
      // Type guard for TextItem
      if ('str' in item && typeof item.str === 'string') {
        items.push({
          str: item.str,
          x: item.transform ? item.transform[4] : undefined,
          y: item.transform ? item.transform[5] : undefined,
          width: item.width,
          height: item.height
        });
      }
    }

    return reconstructPdfParagraphs(items);
  }

  /**
   * Renders the specified page onto an HTML canvas element.
   */
  public async renderPageToCanvas(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    scale = 1.5
  ): Promise<{ width: number; height: number }> {
    if (!this.pdfDoc) {
      throw new Error('PDF document is not loaded.');
    }

    const page = await this.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to acquire 2D canvas rendering context.');
    }

    // Clear previous render
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport
    };

    // @ts-expect-error pdfjs typing compatibility
    await page.render(renderContext).promise;

    return {
      width: viewport.width,
      height: viewport.height
    };
  }

  /**
   * Extracts and translates all text paragraphs on a given page.
   */
  public async translatePage(
    pageNumber: number,
    targetLanguage?: string
  ): Promise<PageTranslationResult> {
    const paragraphs = await this.extractPageParagraphs(pageNumber);

    if (paragraphs.length === 0) {
      return {
        pageNumber,
        originalParagraphs: [],
        translatedParagraphs: [],
        targetLanguage: targetLanguage || 'fa'
      };
    }

    const settings = await storageService.getSettings();
    const targetLang = targetLanguage || settings.targetLanguage || 'fa';

    // Batch paragraphs into chunks
    const chunks: TranslationChunk[] = paragraphs.map((text, idx) => ({
      id: idx,
      text,
      nodeIndex: idx
    }));

    const batchResponse = await geminiClient.translateBatch(chunks, {
      targetLanguage: targetLang,
      style: settings.translationStyle
    });

    const translationMap = new Map<number, string>();
    for (const t of batchResponse.translations) {
      translationMap.set(t.id, t.translation);
    }

    const translatedParagraphs = paragraphs.map((orig, idx) => {
      return translationMap.get(idx) || orig;
    });

    return {
      pageNumber,
      originalParagraphs: paragraphs,
      translatedParagraphs,
      targetLanguage: targetLang
    };
  }

  /**
   * Cleans up loaded document references.
   */
  public destroy(): void {
    if (this.pdfDoc) {
      try {
        const doc = this.pdfDoc as unknown as { destroy?: () => Promise<void> | void };
        doc.destroy?.();
      } catch {
        // Ignore destroy error
      }
      this.pdfDoc = null;
    }
  }
}
