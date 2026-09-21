import { describe, it, expect } from 'vitest';
import { TranslationCache } from '../src/services/translation/cache';

describe('TranslationCache', () => {
  it('should store and retrieve cached translations', () => {
    const cache = new TranslationCache(5);
    cache.set('Hello', 'fa', 'natural', 'سلام');

    expect(cache.get('Hello', 'fa', 'natural')).toBe('سلام');
    expect(cache.has('Hello', 'fa', 'natural')).toBe(true);
    expect(cache.get('Hello', 'fa', 'technical')).toBeUndefined();
    expect(cache.get('Hello', 'de', 'natural')).toBeUndefined();
  });

  it('should evict oldest entry when capacity is reached', () => {
    const cache = new TranslationCache(2);
    cache.set('One', 'fa', 'natural', 'یک');
    cache.set('Two', 'fa', 'natural', 'دو');
    expect(cache.size()).toBe(2);

    cache.set('Three', 'fa', 'natural', 'سه');
    expect(cache.size()).toBe(2);
    expect(cache.get('One', 'fa', 'natural')).toBeUndefined();
    expect(cache.get('Two', 'fa', 'natural')).toBe('دو');
    expect(cache.get('Three', 'fa', 'natural')).toBe('سه');
  });
});
