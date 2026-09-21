export type ThemeMode = 'system' | 'dark' | 'light';
export type UILanguage = 'en' | 'fa';

export type ExplanationLevel = 'none' | 'important' | 'technical' | 'detailed';
export type TranslationStyle = 'natural' | 'literal' | 'professional' | 'technical';

export type PanelPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'remember';

export type ScreenshotFormat = 'png' | 'jpeg';

export type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-pro';

export interface ExtensionSettings {
  // General
  targetLanguage: string;
  sourceLanguage: string;
  uiLanguage: UILanguage;
  theme: ThemeMode;
  enableAnimations: boolean;

  // Translation
  explainTerms: boolean;
  explanationLevel: ExplanationLevel;
  translationStyle: TranslationStyle;
  preserveCode: boolean;

  // Result Panel
  panelPosition: PanelPosition;
  rememberPosition: boolean;
  lastSavedPosition: { x: number; y: number } | null;
  panelOpacity: number; // 0.2 - 1.0
  panelWidth: number; // in pixels
  panelMaxHeight: number; // in pixels
  enableDragging: boolean;

  // Screenshot
  screenshotFormat: ScreenshotFormat;
  screenshotQuality: number; // 0.1 - 1.0
  fullPageCaptureDelay: number; // ms to wait after scroll for render stabilization
  autoRestoreScroll: boolean;

  // AI & Gemini
  geminiApiKey: string;
  geminiModel: GeminiModel;
  temperature: number;
  requestTimeout: number; // ms
}

export interface StoredSettings extends Partial<ExtensionSettings> {
  // May be partial when loaded from chrome.storage
}
