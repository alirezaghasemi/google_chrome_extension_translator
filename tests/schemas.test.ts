import { describe, it, expect } from 'vitest';
import { REGION_TRANSLATION_SCHEMA, BATCH_TRANSLATION_SCHEMA } from '../src/services/gemini/schemas';

describe('Gemini Schemas', () => {
  it('should define required fields for region translation schema', () => {
    expect(REGION_TRANSLATION_SCHEMA.type).toBe('OBJECT');
    expect(REGION_TRANSLATION_SCHEMA.required).toContain('sourceLanguage');
    expect(REGION_TRANSLATION_SCHEMA.required).toContain('targetLanguage');
    expect(REGION_TRANSLATION_SCHEMA.required).toContain('translation');
    expect(REGION_TRANSLATION_SCHEMA.properties.explanations.type).toBe('ARRAY');
  });

  it('should define required fields for batch translation schema', () => {
    expect(BATCH_TRANSLATION_SCHEMA.type).toBe('OBJECT');
    expect(BATCH_TRANSLATION_SCHEMA.required).toContain('translations');
    expect(BATCH_TRANSLATION_SCHEMA.properties.translations.type).toBe('ARRAY');
  });
});
