export const en = {
  app: {
    title: 'AI Translator & Screenshot',
    subtitle: 'Translate pages, extract text, and capture screenshots with Gemini'
  },
  actions: {
    translatePage: 'Translate Page',
    translateRegion: 'Translate Region',
    captureViewport: 'Capture Viewport',
    captureFullPage: 'Full Page Screenshot',
    restoreOriginal: 'Restore Original',
    pause: 'Pause',
    resume: 'Resume',
    cancel: 'Cancel',
    close: 'Close',
    closeAll: 'Close All',
    copy: 'Copy Translation',
    copied: 'Copied!',
    retranslate: 'Retranslate',
    save: 'Save Changes',
    saved: 'Saved Successfully',
    testConnection: 'Test Connection',
    deleteKey: 'Delete Key',
    download: 'Download',
    copyImage: 'Copy Image',
    settings: 'Settings'
  },
  status: {
    apiConfigured: 'Gemini API Configured',
    apiMissing: 'Gemini API Key Required',
    testing: 'Verifying...',
    validKey: 'API Key is valid!',
    invalidKey: 'Invalid API key or network failure',
    analyzing: 'Analyzing with Gemini...',
    translating: 'Translating page...',
    capturing: 'Capturing...',
    stitching: 'Stitching full page...',
    pageTranslated: 'Page translation complete'
  },
  panel: {
    title: 'AI Translation',
    source: 'Original',
    translation: 'Translation',
    explanations: 'Technical Terms & Context',
    noExplanations: 'No specialized terms detected.',
    opacity: 'Opacity',
    targetLanguage: 'Target Language',
    visualContent: 'Visual Media / Image'
  },
  settings: {
    tabs: {
      general: 'General',
      translation: 'Translation',
      panel: 'Result Panel',
      screenshot: 'Screenshot',
      ai: 'AI & Gemini',
      privacy: 'Privacy'
    },
    general: {
      targetLang: 'Default Target Language',
      sourceLang: 'Default Source Language',
      theme: 'Theme',
      system: 'System Default',
      dark: 'Dark Mode',
      light: 'Light Mode',
      uiLang: 'Extension Language'
    },
    translation: {
      explainTerms: 'Explain technical & domain terms',
      explainLevel: 'Explanation Detail Level',
      levelNone: 'None',
      levelImportant: 'Important terms only',
      levelTechnical: 'Technical terms',
      levelDetailed: 'Detailed contextual explanations',
      style: 'Translation Style',
      styleNatural: 'Natural & Idiomatic',
      styleLiteral: 'Literal',
      styleProfessional: 'Professional / Formal',
      styleTechnical: 'Technical & Engineering',
      preserveCode: 'Preserve code blocks and technical snippets'
    },
    panel: {
      position: 'Default Panel Position',
      remember: 'Remember last dragged position',
      opacity: 'Default Transparency',
      width: 'Default Width (px)',
      maxHeight: 'Max Height (px)',
      draggable: 'Enable dragging panels across the page'
    },
    screenshot: {
      format: 'Image Format',
      quality: 'JPEG Quality',
      delay: 'Full-page scroll delay (ms)',
      autoRestore: 'Automatically restore scroll position after capture'
    },
    ai: {
      apiKey: 'Google AI Studio / Gemini API Key',
      apiKeyHint: 'Enter your personal Gemini API key from aistudio.google.com',
      model: 'AI Model',
      temperature: 'Temperature (Creativity / Accuracy)',
      timeout: 'Request Timeout (seconds)'
    },
    privacy: {
      title: 'Your Privacy Matters',
      p1: 'Your Gemini API key is stored strictly on your local device using Chrome extension storage.',
      p2: 'No third-party backend servers, analytics, or trackers are used in this extension.',
      p3: 'Page content and screenshots are only sent directly to Google Gemini APIs upon your explicit request.'
    }
  }
};
