import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseApiKeys, ApiKeyPool } from '../src/services/gemini/key-manager';

describe('API Key Pool & Failover Manager', () => {
  describe('parseApiKeys', () => {
    it('should parse single api key correctly', () => {
      const keys = parseApiKeys('AIzaSyA1234567890');
      expect(keys).toEqual(['AIzaSyA1234567890']);
    });

    it('should parse multiple comma-separated keys', () => {
      const input = 'AIzaSyKey1, AIzaSyKey2 ,AIzaSyKey3';
      const keys = parseApiKeys(input);
      expect(keys).toEqual(['AIzaSyKey1', 'AIzaSyKey2', 'AIzaSyKey3']);
    });

    it('should parse newline-separated keys with blank lines and whitespace', () => {
      const input = `
        AIzaSyKey1

        AIzaSyKey2
        AIzaSyKey3
      `;
      const keys = parseApiKeys(input);
      expect(keys).toEqual(['AIzaSyKey1', 'AIzaSyKey2', 'AIzaSyKey3']);
    });

    it('should parse mixed delimiters (commas, semicolons, newlines)', () => {
      const input = 'KeyA; KeyB,\nKeyC\n;KeyD';
      const keys = parseApiKeys(input);
      expect(keys).toEqual(['KeyA', 'KeyB', 'KeyC', 'KeyD']);
    });

    it('should deduplicate keys preserving order', () => {
      const input = 'Key1, Key2, Key1, Key3, Key2';
      const keys = parseApiKeys(input);
      expect(keys).toEqual(['Key1', 'Key2', 'Key3']);
    });

    it('should handle array inputs as well', () => {
      const input = ['Key1', 'Key2', '', '  Key3  ', 'Key1'];
      const keys = parseApiKeys(input);
      expect(keys).toEqual(['Key1', 'Key2', 'Key3']);
    });

    it('should return empty array for empty or null inputs', () => {
      expect(parseApiKeys('')).toEqual([]);
      expect(parseApiKeys('   ')).toEqual([]);
      expect(parseApiKeys(null)).toEqual([]);
      expect(parseApiKeys(undefined)).toEqual([]);
    });
  });

  describe('ApiKeyPool rotation and cooldown', () => {
    it('should return active key and rotate to next key', () => {
      const pool = new ApiKeyPool(['KeyA', 'KeyB', 'KeyC']);
      expect(pool.getActiveKey()).toBe('KeyA');
      expect(pool.getTotalCount()).toBe(3);

      const next = pool.rotateToNextKey();
      expect(next).toBe('KeyB');
      expect(pool.getActiveKey()).toBe('KeyB');

      const next2 = pool.rotateToNextKey();
      expect(next2).toBe('KeyC');

      // Wraps back to KeyA
      const wrap = pool.rotateToNextKey();
      expect(wrap).toBe('KeyA');
    });

    it('should track rate-limited keys and select an available non-limited key', () => {
      const pool = new ApiKeyPool(['KeyA', 'KeyB', 'KeyC'], 60000);

      // KeyA gets rate-limited
      pool.markRateLimited('KeyA');

      const candidate = pool.getAvailableKey();
      expect(candidate).toBe('KeyB');
      expect(pool.isRateLimited('KeyA')).toBe(true);
      expect(pool.isRateLimited('KeyB')).toBe(false);
    });

    it('should rotate to next available key when marking rate-limited', () => {
      const pool = new ApiKeyPool(['Key1', 'Key2']);
      expect(pool.getActiveKey()).toBe('Key1');

      pool.markRateLimited('Key1');
      // Should advance active key to Key2
      expect(pool.getActiveKey()).toBe('Key2');
    });

    it('should clear cooldown on success and set working key as active', () => {
      const pool = new ApiKeyPool(['Key1', 'Key2'], 60000);
      pool.markRateLimited('Key1');
      expect(pool.isRateLimited('Key1')).toBe(true);

      pool.markSuccess('Key1');
      expect(pool.isRateLimited('Key1')).toBe(false);
      expect(pool.getActiveKey()).toBe('Key1');
    });

    it('should identify when all keys are rate-limited', () => {
      const pool = new ApiKeyPool(['Key1', 'Key2'], 60000);
      pool.markRateLimited('Key1');
      pool.markRateLimited('Key2');

      expect(pool.hasAvailableKey()).toBe(false);
      // When all are rate limited, getAvailableKey returns the one expiring soonest
      expect(pool.getAvailableKey()).not.toBeNull();
    });

    it('should mask API keys for safe UI presentation', () => {
      expect(ApiKeyPool.maskKey('AIzaSyB1234567890abcdef1234567890')).toBe('AIzaSy...7890');
      expect(ApiKeyPool.maskKey('short')).toBe('short');
    });
  });

  describe('GeminiClient Multi-Key Failover Integration', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(async () => {
      const { storageService } = await import('../src/services/storage/storage-service');
      const { geminiClient } = await import('../src/services/gemini/client');
      await storageService.saveSettings({
        geminiApiKey: 'Key1, Key2, Key3',
        geminiModel: 'gemini-3.8-flash',
        requestTimeout: 5000
      });
      geminiClient.getKeyPool().reset();
      geminiClient.getKeyPool().setKeys(['Key1', 'Key2', 'Key3']);
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should automatically failover to Key2 when Key1 hits rate limit (429)', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      const requestedUrls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrls.push(url);
        if (url.includes('key=Key1')) {
          return {
            ok: false,
            status: 429,
            json: async () => ({
              error: {
                message: 'Resource has been exhausted (e.g. check quota).',
                status: 'RESOURCE_EXHAUSTED'
              }
            })
          };
        }

        if (url.includes('key=Key2')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          sourceLanguage: 'en',
                          targetLanguage: 'fa',
                          translation: 'سلام دنیا',
                          explanations: []
                        })
                      }
                    ]
                  }
                }
              ]
            })
          };
        }

        throw new Error('Unexpected URL');
      }) as unknown as typeof fetch;

      const result = await geminiClient.translateRegionText('Hello World', { targetLanguage: 'fa' });

      expect(result.translation).toBe('سلام دنیا');
      expect(requestedUrls).toHaveLength(2);
      expect(requestedUrls[0]).toContain('key=Key1');
      expect(requestedUrls[1]).toContain('key=Key2');
      expect(geminiClient.getKeyPool().getActiveKey()).toBe('Key2');
    });

    it('should throw RATE_LIMIT_EXCEEDED when all configured keys fail with 429', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              message: 'Rate limit exceeded',
              status: 'RESOURCE_EXHAUSTED'
            }
          })
        };
      }) as unknown as typeof fetch;

      await expect(
        geminiClient.translateRegionText('Test Text')
      ).rejects.toThrow(/rate limit/i);
    });

    it('should failover to Key2 when Key1 is invalid (400)', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      const requestedUrls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrls.push(url);
        if (url.includes('key=Key1')) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                message: 'API_KEY_INVALID'
              }
            })
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        sourceLanguage: 'en',
                        targetLanguage: 'fa',
                        translation: 'ترجمه شده',
                        explanations: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }) as unknown as typeof fetch;

      const result = await geminiClient.translateRegionText('Validating failover');
      expect(result.translation).toBe('ترجمه شده');
      expect(requestedUrls.length).toBeGreaterThanOrEqual(2);
    });

    it('should failover to Key2 when Key1 request times out (TIMEOUT)', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      const requestedUrls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        requestedUrls.push(url);
        if (url.includes('key=Key1')) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        sourceLanguage: 'en',
                        targetLanguage: 'fa',
                        translation: 'ترجمه از کلید دوم',
                        explanations: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }) as unknown as typeof fetch;

      const result = await geminiClient.translateRegionText('Validating timeout failover');
      expect(result.translation).toBe('ترجمه از کلید دوم');
      expect(requestedUrls).toHaveLength(2);
      expect(requestedUrls[0]).toContain('key=Key1');
      expect(requestedUrls[1]).toContain('key=Key2');
    });

    it('should automatically fall back to gemini-3.8-flash when receiving 404 model discontinued error', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      const requestedModels: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('gemini-2.5-flash')) {
          requestedModels.push('gemini-2.5-flash');
          return {
            ok: false,
            status: 404,
            json: async () => ({
              error: {
                message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash.',
                status: 'NOT_FOUND'
              }
            })
          };
        }

        requestedModels.push('gemini-3.8-flash');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        sourceLanguage: 'en',
                        targetLanguage: 'fa',
                        translation: 'موفقیت‌آمیز با مدل جدید',
                        explanations: []
                      })
                    }
                  ]
                }
              }
            ]
          })
        };
      }) as unknown as typeof fetch;

      const res = await geminiClient.validateApiKey('Key1', 'gemini-2.5-flash');
      expect(res.valid).toBe(true);
      expect(res.model).toBe('gemini-3.8-flash');
      expect(requestedModels).toContain('gemini-3.8-flash');
    });

    it('should automatically fall back to alternative model when target model returns 503 temporarily unavailable', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      const attemptedUrls: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        attemptedUrls.push(url);
        // gemini-3.8-flash is experiencing 503 high demand
        if (url.includes('gemini-3.8-flash')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: {
                message: 'This model is currently experiencing high demand. Please try again later.',
                status: 'UNAVAILABLE'
              }
            })
          };
        }

        // fallback model (e.g. gemini-1.5-flash) succeeds
        if (url.includes('gemini-1.5-flash')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'OK' }]
                  }
                }
              ]
            })
          };
        }

        return {
          ok: false,
          status: 404
        };
      }) as unknown as typeof fetch;

      const res = await geminiClient.validateApiKey('TestKey123', 'gemini-3.8-flash');
      expect(res.valid).toBe(true);
      expect(res.model).toBe('gemini-1.5-flash');
    });

    it('should validate API key via models API endpoint if generation models return 503', async () => {
      const { geminiClient } = await import('../src/services/gemini/client');

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        // All generation endpoints return 503
        if (url.includes(':generateContent')) {
          return {
            ok: false,
            status: 503,
            json: async () => ({
              error: {
                message: 'Service unavailable',
                status: 'UNAVAILABLE'
              }
            })
          };
        }

        // Models list endpoint returns 200
        if (url.includes('/models?key=')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [{ name: 'models/gemini-1.5-flash' }]
            })
          };
        }

        return { ok: false, status: 404 };
      }) as unknown as typeof fetch;

      const res = await geminiClient.validateApiKey('TestKey123', 'gemini-3.8-flash');
      expect(res.valid).toBe(true);
    });
  });
});
