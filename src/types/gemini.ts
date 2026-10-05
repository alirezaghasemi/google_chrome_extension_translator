export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export interface GeminiRequestPayload {
  contents: GeminiContent[];
  generationConfig?: GeminiGenerationConfig;
}

export interface GeminiCandidate {
  content: {
    parts: Array<{
      text?: string;
    }>;
  };
  finishReason?: string;
}

export interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

export interface TermExplanation {
  term: string;
  meaning: string;
  context?: string;
}

export interface StructuredTranslationPayload {
  sourceLanguage: string;
  targetLanguage: string;
  translation: string;
  detectedText?: string;
  explanations?: TermExplanation[];
}

export interface StructuredBatchTranslationPayload {
  translations: Array<{
    id: number;
    translation: string;
  }>;
}
