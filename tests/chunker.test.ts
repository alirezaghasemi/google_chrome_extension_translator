import { describe, it, expect } from 'vitest';
import { isTranslatableText, createTranslationBatches } from '../src/services/translation/chunker';

describe('Chunker Service', () => {
  it('should identify translatable text correctly', () => {
    expect(isTranslatableText('')).toBe(false);
    expect(isTranslatableText('   ')).toBe(false);
    expect(isTranslatableText('12345')).toBe(false);
    expect(isTranslatableText('... !?')).toBe(false);
    expect(isTranslatableText('a')).toBe(false); // <= 1 char

    expect(isTranslatableText('Hello world')).toBe(true);
    expect(isTranslatableText('مدل‌های زبانی بزرگ')).toBe(true);
    expect(isTranslatableText('Section 3.1: Overview')).toBe(true);
  });

  it('should batch items within maxItemsPerBatch and maxCharsPerBatch', () => {
    const items = [
      { text: 'Paragraph one with some text.', nodeIndex: 0 },
      { text: 'Paragraph two with more details.', nodeIndex: 1 },
      { text: 'Paragraph three with technical explanations.', nodeIndex: 2 }
    ];

    const batches = createTranslationBatches(items, {
      maxItemsPerBatch: 2,
      maxCharsPerBatch: 1000
    });

    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(2);
    expect(batches[1].length).toBe(1);

    expect(batches[0][0].id).toBe(0);
    expect(batches[0][0].nodeIndex).toBe(0);
    expect(batches[0][1].id).toBe(1);
    expect(batches[0][1].nodeIndex).toBe(1);
    expect(batches[1][0].id).toBe(2);
    expect(batches[1][0].nodeIndex).toBe(2);
  });

  it('should split by character limit if items exceed maxCharsPerBatch', () => {
    const items = [
      { text: 'A'.repeat(50), nodeIndex: 0 },
      { text: 'B'.repeat(60), nodeIndex: 1 }
    ];

    const batches = createTranslationBatches(items, {
      maxItemsPerBatch: 10,
      maxCharsPerBatch: 80
    });

    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(1);
    expect(batches[1].length).toBe(1);
  });
});
