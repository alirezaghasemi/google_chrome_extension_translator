export class TranslationCache {
  private cache: Map<string, string> = new Map();
  private maxEntries: number;

  constructor(maxEntries = 2000) {
    this.maxEntries = maxEntries;
  }

  private generateKey(text: string, targetLanguage: string, style: string): string {
    return `${targetLanguage}:${style}:${text.trim()}`;
  }

  public get(text: string, targetLanguage: string, style: string): string | undefined {
    const key = this.generateKey(text, targetLanguage, style);
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Refresh key for LRU order
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  public set(text: string, targetLanguage: string, style: string, translation: string): void {
    const key = this.generateKey(text, targetLanguage, style);
    if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, translation);
  }

  public has(text: string, targetLanguage: string, style: string): boolean {
    return this.cache.has(this.generateKey(text, targetLanguage, style));
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const translationCache = new TranslationCache();
