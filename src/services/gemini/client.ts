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
  createBatchTranslationPrompt,
  createParagraphTranslationPrompt
} from './prompts';
import { REGION_TRANSLATION_SCHEMA, BATCH_TRANSLATION_SCHEMA } from './schemas';
import { ExplanationLevel, TranslationStyle, GeminiModel } from '../../types/settings';
import { parseApiKeys, ApiKeyPool } from './key-manager';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiClient {
  private static instance: GeminiClient;
  private keyPool = new ApiKeyPool();

  public static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      GeminiClient.instance = new GeminiClient();
    }
    return GeminiClient.instance;
  }

  public getKeyPool(): ApiKeyPool {
    return this.keyPool;
  }

  /**
   * Internal request sender with retry logic and timeout for a single designated API key.
   */
  public async executeSingleKeyRequest(
    model: string,
    apiKey: string,
    payload: GeminiRequestPayload,
    timeoutMs: number,
    retryCount = 1
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
          lastError = new GeminiApiError(`Gemini request timed out after ${timeoutMs / 1000}s.`, 'TIMEOUT');
          if (attempt < retryCount) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw lastError;
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
   * High-level request sender with automatic multi-key failover.
   * If a key hits rate limit (429 / RESOURCE_EXHAUSTED) or invalid key,
   * it fails over seamlessly to the next configured key.
   */
  public async executeRequest(
    model: string,
    payload: GeminiRequestPayload,
    timeoutMs: number
  ): Promise<string> {
    const settings = await storageService.getSettings();
    const configuredKeys = parseApiKeys(
      settings.geminiApiKeys && settings.geminiApiKeys.length > 0
        ? settings.geminiApiKeys
        : settings.geminiApiKey
    );

    if (configuredKeys.length === 0) {
      throw new GeminiApiError(
        'Gemini API key is not configured. Please enter your API key in Settings.',
        'MISSING_API_KEY'
      );
    }

    this.keyPool.setKeys(configuredKeys);

    const totalKeys = configuredKeys.length;
    let lastError: GeminiApiError | null = null;
    let attemptsCount = 0;

    // If multiple keys are available, failover immediately on 429 without slow retry backoff.
    // If only 1 key is configured, allow 1 retry attempt.
    const retryPerKey = totalKeys > 1 ? 0 : 1;

    while (attemptsCount < totalKeys) {
      const activeKey = this.keyPool.getAvailableKey();
      if (!activeKey) break;

      attemptsCount++;

      try {
        const result = await this.executeSingleKeyRequest(model, activeKey, payload, timeoutMs, retryPerKey);
        this.keyPool.markSuccess(activeKey);
        return result;
      } catch (err: unknown) {
        if (err instanceof GeminiApiError) {
          lastError = err;

          const isRateLimit =
            err.code === 'RATE_LIMIT_EXCEEDED' ||
            err.code === 'QUOTA_EXCEEDED' ||
            err.httpStatus === 429;

          const isInvalidKey =
            err.code === 'INVALID_API_KEY' ||
            err.httpStatus === 401 ||
            err.httpStatus === 403 ||
            (err.httpStatus === 400 &&
              (err.message.toLowerCase().includes('key') ||
                err.message.toLowerCase().includes('api_key')));

          const isServerUnavailable =
            err.httpStatus === 503 ||
            err.httpStatus === 500;

          if (isRateLimit) {
            this.keyPool.markRateLimited(activeKey);
            console.warn(
              `[GeminiClient] API key (${ApiKeyPool.maskKey(activeKey)}) rate limit exceeded. Failing over to next key (${attemptsCount}/${totalKeys})...`
            );
          } else if (isServerUnavailable) {
            this.keyPool.markTimeout(activeKey, 30000);
            console.warn(
              `[GeminiClient] API key (${ApiKeyPool.maskKey(activeKey)}) server unavailable (${err.httpStatus}). Failing over to next key (${attemptsCount}/${totalKeys})...`
            );
          } else if (isInvalidKey) {
            this.keyPool.markInvalid(activeKey);
            console.warn(
              `[GeminiClient] API key (${ApiKeyPool.maskKey(activeKey)}) invalid/unauthorized. Failing over to next key (${attemptsCount}/${totalKeys})...`
            );
          } else if (err.httpStatus === 404 && model !== 'gemini-3.8-flash') {
            console.warn(`[GeminiClient] Model ${model} is discontinued by Google. Auto-upgrading to gemini-3.8-flash...`);
            await storageService.saveSettings({ geminiModel: 'gemini-3.8-flash' });
            return this.executeRequest('gemini-3.8-flash', payload, timeoutMs);
          } else if (err.code === 'TIMEOUT') {
            this.keyPool.markTimeout(activeKey);
            console.warn(
              `[GeminiClient] API key (${ApiKeyPool.maskKey(activeKey)}) timed out after ${timeoutMs / 1000}s. Failing over to next key (${attemptsCount}/${totalKeys})...`
            );
          } else {
            // Other non-key errors (e.g. SAFETY_BLOCKED) should not rotate keys
            throw err;
          }

          if (attemptsCount < totalKeys && this.keyPool.hasAvailableKey()) {
            continue;
          }

          // If all keys hit 503/500 on this model, attempt fallback to gemini-1.5-flash
          if (isServerUnavailable && model !== 'gemini-1.5-flash') {
            const fallbackModel = 'gemini-1.5-flash';
            console.warn(`[GeminiClient] All configured keys received ${err.httpStatus} on ${model}. Retrying with fallback model ${fallbackModel}...`);
            await storageService.saveSettings({ geminiModel: fallbackModel });
            return this.executeRequest(fallbackModel, payload, timeoutMs);
          }
        } else {
          throw err;
        }
      }
    }

    if (lastError?.code === 'RATE_LIMIT_EXCEEDED' || lastError?.httpStatus === 429) {
      throw new GeminiApiError(
        totalKeys > 1
          ? `Gemini API rate limit exceeded on all ${totalKeys} configured API keys. Please wait a moment or add another key.`
          : 'Gemini API rate limit exceeded. Please wait a moment and try again.',
        'RATE_LIMIT_EXCEEDED',
        429,
        true
      );
    }

    if (lastError?.code === 'TIMEOUT') {
      throw new GeminiApiError(
        totalKeys > 1
          ? `Gemini request timed out after ${timeoutMs / 1000}s across all ${totalKeys} configured API keys. Please check your internet connection or proxy.`
          : `Gemini request timed out after ${timeoutMs / 1000}s.`,
        'TIMEOUT'
      );
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
   * Translates a single text paragraph directly and quickly without explanation or schema overhead.
   */
  public async translateParagraph(
    text: string,
    options?: {
      targetLanguage?: string;
      style?: TranslationStyle;
      timeoutMs?: number;
    }
  ): Promise<string> {
    const settings = await storageService.getSettings();
    const targetLang = options?.targetLanguage || settings.targetLanguage;
    const style = options?.style || settings.translationStyle;
    const timeout = options?.timeoutMs || Math.max(settings.requestTimeout || 60000, 60000);

    const prompt = createParagraphTranslationPrompt(text, targetLang, style);

    const payload: GeminiRequestPayload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: settings.temperature
      }
    };

    const rawResponse = await this.executeRequest(
      settings.geminiModel,
      payload,
      timeout
    );

    return rawResponse
      .trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
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
      timeoutMs?: number;
    }
  ): Promise<StructuredTranslationPayload> {
    const settings = await storageService.getSettings();
    const targetLang = options?.targetLanguage || settings.targetLanguage;
    const expLevel = options?.explanationLevel || (settings.explainTerms ? settings.explanationLevel : 'none');
    const style = options?.style || settings.translationStyle;
    const timeout = options?.timeoutMs || Math.max(settings.requestTimeout || 60000, 60000);

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
      payload,
      timeout
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
    const model = settings.geminiModel === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : (settings.geminiModel || 'gemini-3.8-flash');

    // Clean data URL prefix if present (e.g. "data:image/png;base64,")
    const cleanBase64 = base64Png.replace(/^data:image\/\w+;base64,/, '');

    const prompt = createMultimodalTranslationPrompt(targetLang, expLevel, style);

    const payloadWithSchema: GeminiRequestPayload = {
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

    try {
      const rawResponse = await this.executeRequest(
        model,
        payloadWithSchema,
        settings.requestTimeout
      );

      return this.parseJsonSafe<StructuredTranslationPayload>(rawResponse, (raw) => ({
        sourceLanguage: 'auto',
        targetLanguage: targetLang,
        translation: raw,
        explanations: []
      }));
    } catch (err: unknown) {
      console.warn('[GeminiClient] Multimodal translation with responseSchema failed. Retrying in JSON mode...', err);

      // Fallback 1: Send with responseMimeType: 'application/json' but without responseSchema
      const promptWithJsonGuide = `${prompt}\n\nIMPORTANT: Respond ONLY with a valid JSON object matching:\n{\n  "sourceLanguage": "en",\n  "targetLanguage": "${targetLang}",\n  "detectedText": "extracted source text",\n  "translation": "translated text",\n  "explanations": []\n}`;

      const fallbackPayload: GeminiRequestPayload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptWithJsonGuide },
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
          responseMimeType: 'application/json'
        }
      };

      try {
        const rawResponse = await this.executeRequest(
          model,
          fallbackPayload,
          settings.requestTimeout
        );

        return this.parseJsonSafe<StructuredTranslationPayload>(rawResponse, (raw) => ({
          sourceLanguage: 'auto',
          targetLanguage: targetLang,
          translation: raw,
          explanations: []
        }));
      } catch (fallbackErr: unknown) {
        console.warn('[GeminiClient] JSON mode also failed. Retrying in plain text prompt mode...', fallbackErr);

        // Fallback 2: Send plain request without generationConfig mime/schema
        const plainPayload: GeminiRequestPayload = {
          contents: fallbackPayload.contents,
          generationConfig: {
            temperature: settings.temperature
          }
        };

        const rawResponse = await this.executeRequest(
          model,
          plainPayload,
          settings.requestTimeout
        );

        return this.parseJsonSafe<StructuredTranslationPayload>(rawResponse, (raw) => ({
          sourceLanguage: 'auto',
          targetLanguage: targetLang,
          translation: raw,
          explanations: []
        }));
      }
    }
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
      payload,
      settings.requestTimeout
    );

    return this.parseJsonSafe<StructuredBatchTranslationPayload>(rawResponse);
  }

  /**
   * Probes Google models endpoint to verify key authorization and metadata.
   */
  public async checkKeyModelsList(apiKey: string): Promise<boolean> {
    try {
      const url = `${GEMINI_API_BASE}?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Helper to attempt validating a single key against candidate models.
   */
  private async probeKeyValidity(
    key: string,
    requestedModel: string
  ): Promise<{ valid: boolean; model: string; error?: string }> {
    const candidateModels = [
      requestedModel,
      'gemini-3.8-flash',
      'gemini-1.5-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    const payload: GeminiRequestPayload = {
      contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
      generationConfig: { maxOutputTokens: 5 }
    };

    let lastError: GeminiApiError | null = null;
    for (const testModel of candidateModels) {
      try {
        await this.executeSingleKeyRequest(testModel, key, payload, 8000, 0);
        return { valid: true, model: testModel };
      } catch (err: unknown) {
        if (err instanceof GeminiApiError) {
          lastError = err;
          // Fatal key errors: invalid key or unauthorized
          if (
            err.code === 'INVALID_API_KEY' ||
            err.httpStatus === 401 ||
            err.httpStatus === 403 ||
            (err.httpStatus === 400 &&
              (err.message.toLowerCase().includes('key') || err.message.toLowerCase().includes('api_key')))
          ) {
            return { valid: false, model: testModel, error: err.message };
          }

          // If 404, 500, or 503, try next candidate model
          if (err.httpStatus === 404 || err.httpStatus === 500 || err.httpStatus === 503) {
            continue;
          }
        }
      }
    }

    // If generation endpoints were unavailable (e.g. 503/500/timeout), check if the key is authorized via models list API
    const isAuthentic = await this.checkKeyModelsList(key);
    if (isAuthentic) {
      return { valid: true, model: requestedModel };
    }

    return {
      valid: false,
      model: requestedModel,
      error: lastError?.message || 'Verification failed'
    };
  }

  /**
   * Validates one or multiple API keys.
   */
  public async validateApiKey(
    apiKey: string,
    model = 'gemini-3.8-flash'
  ): Promise<{ valid: boolean; model: string; error?: string; totalKeys?: number; validCount?: number }> {
    const keys = parseApiKeys(apiKey);
    if (keys.length === 0) {
      return { valid: false, model, error: 'API key cannot be empty' };
    }

    if (keys.length > 1) {
      const results = await this.validateAllKeys(keys, model);
      const validCount = results.filter((r) => r.valid).length;
      const allValid = validCount === keys.length;

      if (allValid) {
        return { valid: true, model, totalKeys: keys.length, validCount };
      } else {
        const failed = results.find((r) => !r.valid);
        return {
          valid: false,
          model,
          totalKeys: keys.length,
          validCount,
          error: `${validCount}/${keys.length} keys valid. ${failed ? failed.maskedKey + ': ' + failed.error : ''}`
        };
      }
    }

    const probe = await this.probeKeyValidity(keys[0], model);
    if (probe.valid) {
      if (probe.model !== model) {
        await storageService.saveSettings({ geminiModel: probe.model as GeminiModel });
      }
      return {
        valid: true,
        model: probe.model,
        totalKeys: 1,
        validCount: 1
      };
    }

    return {
      valid: false,
      model,
      totalKeys: 1,
      validCount: 0,
      error: probe.error || 'Verification failed'
    };
  }

  public async validateAllKeys(
    keys: string[],
    model = 'gemini-3.8-flash'
  ): Promise<Array<{ key: string; maskedKey: string; valid: boolean; error?: string }>> {
    const results = [];
    for (const key of keys) {
      const probe = await this.probeKeyValidity(key, model);
      results.push({
        key,
        maskedKey: ApiKeyPool.maskKey(key),
        valid: probe.valid,
        error: probe.error
      });
    }
    return results;
  }
}

export const geminiClient = GeminiClient.getInstance();
