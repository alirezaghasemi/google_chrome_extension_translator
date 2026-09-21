import { ExplanationLevel, TranslationStyle } from '../../types/settings';
import { TranslationChunk } from '../../types/translation';

export function getStyleInstruction(style: TranslationStyle): string {
  switch (style) {
    case 'literal':
      return 'Translate literally and faithfully to the source phrasing while maintaining basic grammar correctness.';
    case 'professional':
      return 'Translate in a polished, formal, and corporate tone suitable for enterprise documentation and publications.';
    case 'technical':
      return 'Translate with precise engineering and scientific vocabulary, preserving standard industry nomenclature.';
    case 'natural':
    default:
      return 'Translate naturally and idiomatically so it reads like it was originally authored by a native speaker.';
  }
}

export function getExplanationInstruction(level: ExplanationLevel): string {
  switch (level) {
    case 'none':
      return 'Do NOT provide any explanations. Leave the "explanations" array empty.';
    case 'important':
      return 'Identify only critical technical terms, abbreviations (e.g. LLM, API, GPU, RAG), or highly domain-specific jargon that would impede understanding for a general technical reader. Provide a concise 1-2 sentence explanation for each.';
    case 'technical':
      return 'Identify all technical terms, libraries, frameworks, architectural concepts, acronyms, and specialized jargon. Explain their meaning and role in 1-2 clear sentences.';
    case 'detailed':
      return 'Identify technical terms, acronyms, uncommon phrases, and domain-specific vocabulary. Provide a thorough, informative explanation for each, including background context and relevance.';
    default:
      return 'Provide explanations only for unfamiliar technical abbreviations and terms.';
  }
}

export function createRegionTranslationPrompt(
  text: string,
  targetLanguage: string,
  explanationLevel: ExplanationLevel,
  style: TranslationStyle,
  pageContext?: string
): string {
  const styleGuide = getStyleInstruction(style);
  const explanationGuide = getExplanationInstruction(explanationLevel);

  return `You are a world-class translation and localization engine.
Task: Translate the following user-selected text into the target language "${targetLanguage}".
${pageContext ? `Surrounding Page Context:\n"""${pageContext.slice(0, 500)}"""\n` : ''}
Translation Guidelines:
1. ${styleGuide}
2. Maintain proper paragraphing and inline formatting.
3. If translating into Persian (Farsi), use standard modern Persian vocabulary, correct typography (half-spaces/نیم‌فاصله where appropriate), and fluent phrasing.
4. Explanations Guidelines:
${explanationGuide}

Source Text to Translate:
"""${text}"""

Return strictly valid JSON adhering to the specified schema with fields: "sourceLanguage", "targetLanguage", "translation", and "explanations".`;
}

export function createMultimodalTranslationPrompt(
  targetLanguage: string,
  explanationLevel: ExplanationLevel,
  style: TranslationStyle
): string {
  const styleGuide = getStyleInstruction(style);
  const explanationGuide = getExplanationInstruction(explanationLevel);

  return `You are an expert AI vision and translation model.
Task: Inspect the attached visual image (which may be a screenshot of a webpage region, diagram, chart, or graphic).
1. Accurately detect and extract all visible text from the image, and put it in the "detectedText" field.
2. Translate the extracted text into the target language "${targetLanguage}" in the "translation" field.
   - ${styleGuide}
   - If translating into Persian (Farsi), use natural Persian phrasing and correct typography.
3. Explanations:
   - ${explanationGuide}

Return strictly valid JSON with "sourceLanguage", "targetLanguage", "detectedText", "translation", and "explanations".`;
}

export function createBatchTranslationPrompt(
  chunks: TranslationChunk[],
  targetLanguage: string,
  style: TranslationStyle
): string {
  const styleGuide = getStyleInstruction(style);
  const jsonInput = JSON.stringify(chunks);

  return `You are a high-speed DOM text translation engine.
Task: Translate the array of text segments into "${targetLanguage}".
${styleGuide}

Rules:
1. Every input item has an "id" (number) and "text" (string).
2. Output a JSON object containing a "translations" array, where each entry has the exact matching "id" and the translated "translation".
3. Do NOT change or omit any "id".
4. Do NOT translate placeholders, code variable names, URLs, or pure numbers. Keep them intact.
5. If an item is already in "${targetLanguage}" or is punctuation/numbers, return it unchanged.

Input Items to Translate:
${jsonInput}

Output strictly valid JSON with field: { "translations": [{ "id": number, "translation": string }] }`;
}
