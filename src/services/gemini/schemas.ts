export const REGION_TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sourceLanguage: {
      type: 'STRING',
      description: 'Detected ISO 639-1 language code or name of source text'
    },
    targetLanguage: {
      type: 'STRING',
      description: 'Target language code'
    },
    detectedText: {
      type: 'STRING',
      description: 'The transcribed original source text found in the image or selection'
    },
    translation: {
      type: 'STRING',
      description: 'Accurate and natural translated text'
    },
    explanations: {
      type: 'ARRAY',
      description: 'List of technical terms, acronyms, domain jargon, or uncommon phrases that need explanation',
      items: {
        type: 'OBJECT',
        properties: {
          term: {
            type: 'STRING',
            description: 'The technical term or acronym'
          },
          meaning: {
            type: 'STRING',
            description: 'Clear, concise explanation of the term in the target language'
          },
          context: {
            type: 'STRING',
            description: 'How this term relates to the context of the sentence/page'
          }
        },
        required: ['term', 'meaning']
      }
    }
  },
  required: ['sourceLanguage', 'targetLanguage', 'translation']
};

export const BATCH_TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    translations: {
      type: 'ARRAY',
      description: 'List of translated text segments mapped by their numerical ID',
      items: {
        type: 'OBJECT',
        properties: {
          id: {
            type: 'INTEGER',
            description: 'The unique numeric identifier matching the input item'
          },
          translation: {
            type: 'STRING',
            description: 'The translated text for this node'
          }
        },
        required: ['id', 'translation']
      }
    }
  },
  required: ['translations']
};
