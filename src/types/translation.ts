export interface TermExplanation {
  term: string;
  meaning: string;
  context?: string;
}

export interface TranslationResult {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  explanations: TermExplanation[];
  timestamp: number;
  isVisual?: boolean;
}

export interface TranslationChunk {
  id: number;
  text: string;
  nodeIndex?: number;
}

export interface PageTranslationProgress {
  status: 'idle' | 'translating' | 'paused' | 'completed' | 'cancelled' | 'restoring' | 'error';
  totalChunks: number;
  completedChunks: number;
  percentage: number;
  errorMessage?: string;
}
