/**
 * Manages multiple Google Gemini API keys with automatic failover,
 * rate limit tracking, cooldown, and rotation.
 */

export interface KeyStatus {
  key: string;
  maskedKey: string;
  index: number;
  isActive: boolean;
  isRateLimited: boolean;
  isInvalid: boolean;
  cooldownRemainingSeconds: number;
}

/**
 * Parses single or multiple API keys separated by commas, semicolons, or newlines.
 * Deduplicates and trims each key, preserving the order of appearance.
 */
export function parseApiKeys(input?: string | string[] | null): string[] {
  if (!input) return [];

  let candidates: string[] = [];

  if (Array.isArray(input)) {
    candidates = input;
  } else if (typeof input === 'string') {
    // Split by newlines, commas, semicolons, and spaces
    candidates = input.split(/[\r\n,;\t]+/);
  }

  const result: string[] = [];
  for (const raw of candidates) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }

  return result;
}

export class ApiKeyPool {
  private keys: string[] = [];
  private activeIndex = 0;
  private rateLimitedUntil = new Map<string, number>();
  private invalidKeys = new Set<string>();
  private defaultCooldownMs: number;

  constructor(initialKeys: string[] = [], defaultCooldownMs = 60000) {
    this.defaultCooldownMs = defaultCooldownMs;
    this.setKeys(initialKeys);
  }

  /**
   * Updates the set of API keys in the pool.
   */
  public setKeys(newKeys: string[]): void {
    const parsed = parseApiKeys(newKeys);
    this.keys = parsed;
    if (this.activeIndex >= this.keys.length) {
      this.activeIndex = 0;
    }
  }

  /**
   * Resets active index and clears cooldown/invalid statuses.
   */
  public reset(): void {
    this.activeIndex = 0;
    this.rateLimitedUntil.clear();
    this.invalidKeys.clear();
  }

  public getAllKeys(): string[] {
    return [...this.keys];
  }

  public getTotalCount(): number {
    return this.keys.length;
  }

  public getActiveIndex(): number {
    return this.activeIndex;
  }

  /**
   * Returns the currently designated active key.
   */
  public getActiveKey(): string | null {
    if (this.keys.length === 0) return null;
    return this.keys[this.activeIndex] || this.keys[0] || null;
  }

  /**
   * Rotates sequentially to the next key in the pool.
   */
  public rotateToNextKey(): string | null {
    if (this.keys.length === 0) return null;
    this.activeIndex = (this.activeIndex + 1) % this.keys.length;
    return this.getActiveKey();
  }

  /**
   * Checks whether a specific key is currently marked as rate-limited.
   */
  public isRateLimited(key: string): boolean {
    const expiry = this.rateLimitedUntil.get(key);
    if (!expiry) return false;

    if (Date.now() >= expiry) {
      this.rateLimitedUntil.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Marks a key as rate-limited (HTTP 429 / Quota Exceeded), setting cooldown.
   * Also automatically rotates activeIndex to the next key.
   */
  public markRateLimited(key: string, customDurationMs?: number): void {
    const cooldown = customDurationMs ?? this.defaultCooldownMs;
    this.rateLimitedUntil.set(key, Date.now() + cooldown);

    // If the rate-limited key is the current active key, advance to the next one
    if (this.getActiveKey() === key && this.keys.length > 1) {
      this.rotateToNextKey();
    }
  }

  /**
   * Marks a key as invalid/unauthorized (e.g. 400 invalid key).
   */
  public markInvalid(key: string): void {
    this.invalidKeys.add(key);
    if (this.getActiveKey() === key && this.keys.length > 1) {
      this.rotateToNextKey();
    }
  }

  /**
   * Marks a key as successfully working. Clears rate-limit cooldown and sets as active.
   */
  public markSuccess(key: string): void {
    this.rateLimitedUntil.delete(key);
    this.invalidKeys.delete(key);

    const idx = this.keys.indexOf(key);
    if (idx !== -1) {
      this.activeIndex = idx;
    }
  }

  /**
   * Checks if there is any key that is not rate-limited and not invalid.
   */
  public hasAvailableKey(): boolean {
    if (this.keys.length === 0) return false;
    return this.keys.some((k) => !this.isRateLimited(k) && !this.invalidKeys.has(k));
  }

  /**
   * Selects the best candidate key to use.
   * Priority:
   * 1. Active key if available.
   * 2. Any other key not rate-limited and not invalid.
   * 3. If all keys are rate-limited, the key whose cooldown expires earliest.
   */
  public getAvailableKey(): string | null {
    if (this.keys.length === 0) return null;

    // Check active key first
    const active = this.getActiveKey();
    if (active && !this.isRateLimited(active) && !this.invalidKeys.has(active)) {
      return active;
    }

    // Search for any other available key starting from next index
    for (let offset = 0; offset < this.keys.length; offset++) {
      const idx = (this.activeIndex + offset) % this.keys.length;
      const key = this.keys[idx];
      if (!this.isRateLimited(key) && !this.invalidKeys.has(key)) {
        this.activeIndex = idx;
        return key;
      }
    }

    // Fallback: If all are rate-limited (excluding permanently invalid), pick the one expiring soonest
    let bestKey: string | null = null;
    let earliestExpiry = Infinity;

    for (const key of this.keys) {
      if (this.invalidKeys.has(key)) continue;
      const expiry = this.rateLimitedUntil.get(key) || 0;
      if (expiry < earliestExpiry) {
        earliestExpiry = expiry;
        bestKey = key;
      }
    }

    return bestKey || active;
  }

  /**
   * Returns inspection status for each key (useful for UI diagnostics).
   */
  public getStatus(): KeyStatus[] {
    const now = Date.now();
    return this.keys.map((key, index) => {
      const expiry = this.rateLimitedUntil.get(key) || 0;
      const isRateLimited = expiry > now;
      const cooldownRemainingSeconds = isRateLimited ? Math.ceil((expiry - now) / 1000) : 0;

      return {
        key,
        maskedKey: ApiKeyPool.maskKey(key),
        index,
        isActive: index === this.activeIndex,
        isRateLimited,
        isInvalid: this.invalidKeys.has(key),
        cooldownRemainingSeconds
      };
    });
  }

  /**
   * Masks key for security (e.g. AIzaSy...7x9q).
   */
  public static maskKey(key: string): string {
    if (!key) return '';
    if (key.length <= 10) return key;
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  }
}
