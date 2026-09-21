import { TranslationChunk } from '../../types/translation';

export interface ChunkOptions {
  maxItemsPerBatch?: number;
  maxCharsPerBatch?: number;
}

export function isTranslatableText(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // Too short
  if (trimmed.length <= 1) return false;
  // Pure numbers or punctuation
  if (/^[\d\s.,:;!?'"()\[\]{}\-_\/\\@#$%^&*+=<>~`|]+$/.test(trimmed)) return false;
  // Contains at least one letter/word character
  return /[\p{L}\p{N}]/u.test(trimmed);
}

export function createTranslationBatches(
  items: Array<{ text: string; nodeIndex: number }>,
  options: ChunkOptions = {}
): TranslationChunk[][] {
  const maxItems = options.maxItemsPerBatch || 25;
  const maxChars = options.maxCharsPerBatch || 3000;

  const batches: TranslationChunk[][] = [];
  let currentBatch: TranslationChunk[] = [];
  let currentBatchChars = 0;
  let chunkIdCounter = 0;

  for (const item of items) {
    if (!isTranslatableText(item.text)) {
      continue;
    }

    const itemLength = item.text.length;

    // If adding this item exceeds max items or max chars, seal current batch
    if (
      currentBatch.length >= maxItems ||
      (currentBatchChars + itemLength > maxChars && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }

    currentBatch.push({
      id: chunkIdCounter++,
      text: item.text,
      nodeIndex: item.nodeIndex
    });
    currentBatchChars += itemLength;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
