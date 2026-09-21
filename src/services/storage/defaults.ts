import { ExtensionSettings } from '../../types/settings';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  // General
  targetLanguage: 'fa',
  sourceLanguage: 'auto',
  uiLanguage: 'fa',
  theme: 'system',
  enableAnimations: true,

  // Translation
  explainTerms: true,
  explanationLevel: 'important',
  translationStyle: 'natural',
  preserveCode: true,

  // Result Panel
  panelPosition: 'bottom-right',
  rememberPosition: true,
  lastSavedPosition: null,
  panelOpacity: 0.95,
  panelWidth: 420,
  panelMaxHeight: 520,
  enableDragging: true,

  // Screenshot
  screenshotFormat: 'png',
  screenshotQuality: 0.92,
  fullPageCaptureDelay: 350,
  autoRestoreScroll: true,

  // AI & Gemini
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  temperature: 0.2,
  requestTimeout: 30000
};

export const SUPPORTED_LANGUAGES = [
  { code: 'fa', name: 'فارسی (Persian)', native: 'فارسی', dir: 'rtl' },
  { code: 'en', name: 'English', native: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية (Arabic)', native: 'العربية', dir: 'rtl' },
  { code: 'de', name: 'German', native: 'Deutsch', dir: 'ltr' },
  { code: 'fr', name: 'French', native: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Spanish', native: 'Español', dir: 'ltr' },
  { code: 'it', name: 'Italian', native: 'Italiano', dir: 'ltr' },
  { code: 'ru', name: 'Russian', native: 'Русский', dir: 'ltr' },
  { code: 'zh', name: 'Chinese', native: '中文', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', native: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', native: '한국어', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', dir: 'ltr' }
] as const;

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fast, Recommended)', supportsVision: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Highest Accuracy)', supportsVision: true },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Balanced)', supportsVision: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Complex Reasoning)', supportsVision: true }
] as const;
