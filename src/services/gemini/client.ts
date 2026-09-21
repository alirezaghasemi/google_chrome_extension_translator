import { storageService } from '../storage/storage-service';
import { GeminiApiError } from './errors';
import {
  GeminiRequestPayload,
  GeminiResponse,
  StructuredTranslationPayload,
  StructuredBatchTranslationPayload
} from '../../types/gemini';
import { TranslationChunk } from '../../types/translation';
import {
  createRegionTranslationPrompt,
  createMultimodalTranslationPrompt,
  createBatchTranslationPrompt
} from './prompts';
import { REGION_TRANSLATION_SCHEMA, BATCH_TRANSLATION_SCHEMA } from './schemas';
import { ExplanationLevel, TranslationStyle } from '../../types/settings';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
  private static instance: GeminiClient;

  public static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      GeminiClient.instance = new GeminiClient();
    }
    return GeminiClient.instance;
  }

  /**
   * Internal request sender with retry logic and timeout.
   */
  private async executeRequest(
    model: string,
    apiKey: string,
    payload: GeminiRequestPayload,
    timeoutMs: number,
    retryCount = 2
  ): Promise<string> {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new GeminiApiError(
        'Gemini API key is not configured. Please enter your API key in Settings.',
        'MISSING_API_KEY'
      );
    }

    const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (!res.ok) {
          let errorData;
          try {
            errorData = await res.json();
          } catch {
            // Non-JSON error body
          }

          const apiError = GeminiApiError.fromHttpResponse(res.status, errorData);
          if (apiError.isRetryable && attempt < retryCount) {
            const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }
          throw apiError;
        }

        const data: GeminiResponse = await res.json();
        const candidate = data.candidates?.[0];
        const textOutput = candidate?.content?.parts?.[0]?.text;

        if (!textOutput) {
          if (candidate?.finishReason === 'SAFETY') {
            throw new GeminiApiError('Content blocked by Gemini safety filters.', 'SAFETY_BLOCKED');
          }
          throw new GeminiApiError('Empty response received from Gemini.', 'MALFORMED_RESPONSE');
        }

        return textOutput;
      } catch (err: unknown) {
        clearTimeout(timer);

        if (err instanceof GeminiApiError) {
          throw err;
        }

        const error = err as { name?: string; message?: string };
        if (error.name === 'AbortError') {
          throw new GeminiApiError(`Gemini request timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT');
        }

        lastError = new GeminiApiError(
          `Network connection to Gemini failed: ${error.message || 'Unknown network error'}`,
          'NETWORK_ERROR'
        );

        if (attempt < retryCount) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }
    }

    throw lastError || new GeminiApiError('Failed to communicate with Gemini.', 'UNKNOWN_ERROR');
  }

  /**
   * Safely parses JSON output from Gemini, stripping potential markdown blocks.
   */
  private parseJsonSafe<T>(rawText: string, fallbackExtractor?: (text: string) => T): T {
    const trimmed = rawText.trim();
    // Strip markdown code fences if model returned ```json ... ```
    const cleaned = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // If structured parsing fails, attempt regex extraction or fallback
      if (fallbackExtractor) {
        return fallbackExtractor(rawText);
      }
      throw new GeminiApiError('Failed to parse structured JSON from Gemini response.', 'MALFORMED_RESPONSE');
    }
  }

  /**
   * Translates selected text, returning translation and optional technical term explanations.
   */
  public async translateRegionText(
    text: string,
    options?: {
      targetLanguage?: string;
      explanationLevel?: ExplanationLevel;
      style?: TranslationStyle;
      context?: string;
    }
  ): Promise<StructuredTranslationPayload> {
    const settings = await storageService.getSettings();
    const targetLang = options?.targetLanguage || settings.targetLanguage;
    const expLevel = options?.explanationLevel || (settings.explainTerms ? settings.explanationLevel : 'none');
    const style = options?.style || settings.translationStyle;

    const prompt = createRegionTranslationPrompt(text, targetLang, expLevel, style, options?.context);

    const payload: GeminiRequestPayload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        responseMimeType: 'application/json',
        responseSchema: REGION_TRANSLATION_SCHEMA
      }
    };

    const rawResponse = await this.executeRequest(
      settings.geminiModel,
      settings.geminiApiKey,
      payload,
      settings.requestTimeout
    );

    return this.parseJsonSafe<StructuredTranslationPayload>(rawResponse, (raw) => ({
      sourceLanguage: 'auto',
      targetLanguage: targetLang,
      translation: raw,
      explanations: []
    }));
  }

  /**
   * Translates a visual region (e.g. image, canvas, or chart screenshot) via Gemini multimodal vision.
   */
  public async translateRegionImage(
    base64Png: string,
    options?: {
      targetLanguage?: string;
      explanationLevel?: ExplanationLevel;
      style?: TranslationStyle;
    }
  ): Promise<StructuredTranslationPayload> {
    const settings = await storageService.getSettings();
    const targetLang = options?.targetLanguage || settings.targetLanguage;
    const expLevel = options?.explanationLevel || (settings.explainTerms ? settings.explanationLevel : 'none');
    const style = options?.style || settings.translationStyle;

    // Clean data URL prefix if present (e.g. "data:image/png;base64,")
    const cleanBase64 = base64Png.replace(/^data:image\/\w+;base64,/, '');

    const prompt = createMultimodalTranslationPrompt(targetLang, expLevel, style);

    const payload: GeminiRequestPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: settings.temperature,
        responseMimeType: 'application/json',
        responseSchema: REGION_TRANSLATION_SCHEMA
      }
    };

    const rawResponse = await this.executeRequest(
      settings.geminiModel,
      settings.geminiApiKey,
      payload,
      settings.requestTimeout
    );

    return this.parseJsonSafe<StructuredTranslationPayload>(rawResponse, (raw) => ({
      sourceLanguage: 'auto',
      targetLanguage: targetLang,
      translation: raw,
      explanations: []
    }));
  }

  /**
   * Translates an array of DOM text chunks in a single request.
   */
  public async translateBatch(
    chunks: TranslationChunk[],
    options?: {
      targetLanguage?: string;
      style?: TranslationStyle;
    }
  ): Promise<StructuredBatchTranslationPayload> {
    if (chunks.length === 0) {
      return { translations: [] };
    }

    const settings = await storageService.getSettings();
    const targetLang = options?.targetLanguage || settings.targetLanguage;
    const style = options?.style || settings.translationStyle;

    const prompt = createBatchTranslationPrompt(chunks, targetLang, style);

    const payload: GeminiRequestPayload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature,
        responseMimeType: 'application/json',
        responseSchema: BATCH_TRANSLATION_SCHEMA
      }
    };

    const rawResponse = await this.executeRequest(
      settings.geminiModel,
      settings.geminiApiKey,
      payload,
      settings.requestTimeout
    );

    return this.parseJsonSafe<StructuredBatchTranslationPayload>(rawResponse);
  }

  /**
   * Validates an API key with a minimal token query.
   */
  public async validateApiKey(
    apiKey: string,
    model = 'gemini-2.5-flash'
  ): Promise<{ valid: boolean; model: string; error?: string }> {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, model, error: 'API key cannot be empty' };
    }

    try {
      const payload: GeminiRequestPayload = {
        contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };

      await this.executeRequest(model, apiKey, payload, 10000, 0);
      return { valid: true, model };
    } catch (err: unknown) {
      const error = err as GeminiApiError;
      return {
        valid: false,
        model,
        error: error.message || 'Verification failed'
      };
    }
  }
}

export const geminiClient = GeminiClient.getInstance();
