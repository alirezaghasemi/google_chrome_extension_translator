import { TermExplanation } from '../../types/gemini';

export interface PageTranslationResult {
  pageNumber: number;
  originalParagraphs: string[];
  translatedParagraphs: string[];
  targetLanguage: string;
  explanations?: TermExplanation[];
}

export type PdfTranslationStatus = 'idle' | 'translating' | 'paused' | 'completed' | 'error';

export interface PdfTranslationState {
  status: PdfTranslationStatus;
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  error?: string;
}

export class PdfDocumentTranslator {
  private state: PdfTranslationState = {
    status: 'idle',
    currentPage: 0,
    totalPages: 0,
    progressPercent: 0
  };

  private translations: Map<number, PageTranslationResult> = new Map();
  private listeners: Set<(state: PdfTranslationState) => void> = new Set();

  public getState(): PdfTranslationState {
    return { ...this.state };
  }

  public setTotalPages(total: number): void {
    this.state.totalPages = Math.max(0, total);
    this.updateProgress();
    this.notify();
  }

  public setCurrentPage(page: number): void {
    this.state.currentPage = Math.max(0, page);
    this.updateProgress();
    this.notify();
  }

  public setStatus(status: PdfTranslationStatus, error?: string): void {
    this.state.status = status;
    if (error !== undefined) {
      this.state.error = error;
    }
    this.notify();
  }

  private updateProgress(): void {
    if (this.state.totalPages > 0) {
      this.state.progressPercent = Math.round(
        (this.state.currentPage / this.state.totalPages) * 100
      );
    } else {
      this.state.progressPercent = 0;
    }
  }

  public setPageTranslation(pageNumber: number, translation: PageTranslationResult): void {
    this.translations.set(pageNumber, translation);
    this.notify();
  }

  public getPageTranslation(pageNumber: number): PageTranslationResult | undefined {
    return this.translations.get(pageNumber);
  }

  public hasPageTranslation(pageNumber: number): boolean {
    return this.translations.has(pageNumber);
  }

  public getAllTranslations(): Map<number, PageTranslationResult> {
    return new Map(this.translations);
  }

  public reset(): void {
    this.state = {
      status: 'idle',
      currentPage: 0,
      totalPages: 0,
      progressPercent: 0
    };
    this.translations.clear();
    this.notify();
  }

  public onStateChange(listener: (state: PdfTranslationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('PdfDocumentTranslator listener error:', err);
      }
    });
  }
}

export const pdfDocumentTranslator = new PdfDocumentTranslator();
