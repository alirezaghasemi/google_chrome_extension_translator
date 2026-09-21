import { ExtensionSettings, ScreenshotFormat } from './settings';
import { PageTranslationProgress } from './translation';

export type ExtensionMessageType =
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'VALIDATE_API_KEY'
  | 'CAPTURE_VISIBLE_TAB'
  | 'START_PAGE_TRANSLATION'
  | 'PAUSE_PAGE_TRANSLATION'
  | 'RESUME_PAGE_TRANSLATION'
  | 'CANCEL_PAGE_TRANSLATION'
  | 'RESTORE_ORIGINAL_PAGE'
  | 'START_REGION_SELECTION'
  | 'CANCEL_REGION_SELECTION'
  | 'TRIGGER_VIEWPORT_SCREENSHOT'
  | 'TRIGGER_FULLPAGE_SCREENSHOT'
  | 'GET_PAGE_TRANSLATION_STATE'
  | 'PAGE_TRANSLATION_STATE_UPDATE'
  | 'TRANSLATE_SELECTED_TEXT'
  | 'OPEN_OPTIONS_PAGE';

export interface ExtensionMessage<T = unknown> {
  type: ExtensionMessageType;
  payload?: T;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CaptureVisibleTabPayload {
  format?: ScreenshotFormat;
  quality?: number;
}

export interface SaveSettingsPayload {
  settings: Partial<ExtensionSettings>;
}

export interface ValidateApiKeyPayload {
  apiKey: string;
  model?: string;
}

export interface PageTranslationStateResponse {
  progress: PageTranslationProgress;
  isTranslated: boolean;
}

export interface TranslateSelectionPayload {
  text: string;
}
