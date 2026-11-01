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
            err.httpStatus === 400 ||
            err.httpStatus === 401 ||
            err.httpStatus === 403;

          if (isRateLimit) {
            this.keyPool.markRateLimited(activeKey);
            console.warn(
              `[GeminiClient] API key (${ApiKeyPool.maskKey(activeKey)}) rate limit exceeded. Failing over to next key (${attemptsCount}/${totalKeys})...`
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
          } else {
            // Other non-key errors (e.g. SAFETY_BLOCKED or TIMEOUT) should not rotate keys
            throw err;
          }

          if (attemptsCount < totalKeys && this.keyPool.hasAvailableKey()) {
            continue;
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
      payload,
      settings.requestTimeout
    );

    return this.parseJsonSafe<StructuredBatchTranslationPayload>(rawResponse);
  }

  /**
   * Validates one or multiple API keys.
   */
  public async validateApiKey(
    apiKey: string,
    model = 'gemini-3.8-flash'
  ): Promise<{ valid: boolean; model: string; error?: string; totalKeys?: number; validCount?: number }> {
    const effectiveModel = model === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : model;
    const keys = parseApiKeys(apiKey);
    if (keys.length === 0) {
      return { valid: false, model: effectiveModel, error: 'API key cannot be empty' };
    }

    if (keys.length > 1) {
      const results = await this.validateAllKeys(keys, effectiveModel);
      const validCount = results.filter((r) => r.valid).length;
      const allValid = validCount === keys.length;

      if (allValid) {
        return { valid: true, model: effectiveModel, totalKeys: keys.length, validCount };
      } else {
        const failed = results.find((r) => !r.valid);
        return {
          valid: false,
          model: effectiveModel,
          totalKeys: keys.length,
          validCount,
          error: `${validCount}/${keys.length} keys valid. ${failed ? failed.maskedKey + ': ' + failed.error : ''}`
        };
      }
    }

    try {
      const payload: GeminiRequestPayload = {
        contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
        generationConfig: { maxOutputTokens: 5 }
      };

      await this.executeSingleKeyRequest(effectiveModel, keys[0], payload, 10000, 0);
      return { valid: true, model: effectiveModel, totalKeys: 1, validCount: 1 };
    } catch (err: unknown) {
      const error = err as GeminiApiError;

      // If 404 model discontinued error was returned for an older model, try gemini-3.8-flash fallback
      if (error.httpStatus === 404 && effectiveModel !== 'gemini-3.8-flash') {
        try {
          const payload: GeminiRequestPayload = {
            contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
            generationConfig: { maxOutputTokens: 5 }
          };
          await this.executeSingleKeyRequest('gemini-3.8-flash', keys[0], payload, 10000, 0);
          await storageService.saveSettings({ geminiModel: 'gemini-3.8-flash' });
          return { valid: true, model: 'gemini-3.8-flash', totalKeys: 1, validCount: 1 };
        } catch {
          // fall through to original error
        }
      }

      return {
        valid: false,
        model: effectiveModel,
        totalKeys: 1,
        validCount: 0,
        error: error.message || 'Verification failed'
      };
    }
  }

  public async validateAllKeys(
    keys: string[],
    model = 'gemini-3.8-flash'
  ): Promise<Array<{ key: string; maskedKey: string; valid: boolean; error?: string }>> {
    const effectiveModel = model === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : model;
    const results = [];
    for (const key of keys) {
      try {
        const payload: GeminiRequestPayload = {
          contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
          generationConfig: { maxOutputTokens: 5 }
        };
        await this.executeSingleKeyRequest(effectiveModel, key, payload, 10000, 0);
        results.push({
          key,
          maskedKey: ApiKeyPool.maskKey(key),
          valid: true
        });
      } catch (err: unknown) {
        const error = err as GeminiApiError;

        // Fallback to gemini-3.8-flash if 404 model discontinued
        if (error.httpStatus === 404 && effectiveModel !== 'gemini-3.8-flash') {
          try {
            const payload: GeminiRequestPayload = {
              contents: [{ role: 'user', parts: [{ text: 'Respond with "OK".' }] }],
              generationConfig: { maxOutputTokens: 5 }
            };
            await this.executeSingleKeyRequest('gemini-3.8-flash', key, payload, 10000, 0);
            results.push({
              key,
              maskedKey: ApiKeyPool.maskKey(key),
              valid: true
            });
            continue;
          } catch {
            // fall through
          }
        }

        results.push({
          key,
          maskedKey: ApiKeyPool.maskKey(key),
          valid: false,
          error: error.message || 'Verification failed'
        });
      }
    }
    return results;
  }
}

export const geminiClient = GeminiClient.getInstance();
