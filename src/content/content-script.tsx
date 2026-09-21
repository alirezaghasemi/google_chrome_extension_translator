import React from 'react';
import ReactDOM from 'react-dom/client';
import { ShadowApp, ShadowAppHandle } from './overlays/ShadowHost';
import { EXTENSION_ROOT_ID } from './dom/dom-utils';
import { regionSelector } from './selection/region-selector';
import { translateRegion } from './translation/region-translator';
import { pageTranslator } from './translation/page-translator';
import { fullPageCapturer } from './screenshot/fullpage-capturer';
import { geminiClient } from '../services/gemini/client';
import { storageService } from '../services/storage/storage-service';
import {
  ExtensionMessage,
  ExtensionResponse,
  PageTranslationStateResponse,
  TranslateSelectionPayload
} from '../types/messages';
import shadowStyles from '../styles/shadow-styles.css?inline';

(function initializeContentScript() {
  if (document.getElementById(EXTENSION_ROOT_ID)) {
    return; // Already initialized
  }

  // Create isolated container
  const host = document.createElement('div');
  host.id = EXTENSION_ROOT_ID;
  host.setAttribute('data-extension-ui', 'true');
  host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Inject encapsulated styles
  const styleEl = document.createElement('style');
  styleEl.textContent = shadowStyles;
  shadowRoot.appendChild(styleEl);

  const mountContainer = document.createElement('div');
  mountContainer.id = 'antigravity-shadow-app-root';
  shadowRoot.appendChild(mountContainer);

  let appHandle: ShadowAppHandle | null = null;
  const reactRoot = ReactDOM.createRoot(mountContainer);
  reactRoot.render(
    <React.StrictMode>
      <ShadowApp onMountReady={(handle) => (appHandle = handle)} />
    </React.StrictMode>
  );

  // Runtime message listener
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'START_PAGE_TRANSLATION': {
        const targetLang = (message.payload as { targetLanguage?: string })?.targetLanguage;
        pageTranslator.start(targetLang);
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'PAUSE_PAGE_TRANSLATION': {
        pageTranslator.pause();
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'RESUME_PAGE_TRANSLATION': {
        pageTranslator.resume();
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'RESTORE_ORIGINAL_PAGE': {
        pageTranslator.restoreOriginal();
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'GET_PAGE_TRANSLATION_STATE': {
        const state: PageTranslationStateResponse = {
          progress: pageTranslator.getProgress(),
          isTranslated: pageTranslator.isPageTranslated()
        };
        sendResponse({ success: true, data: state } as ExtensionResponse<PageTranslationStateResponse>);
        return true;
      }

      case 'START_REGION_SELECTION': {
        regionSelector.start(
          shadowRoot,
          async (rect) => {
            try {
              const result = await translateRegion(rect);
              if (appHandle) {
                appHandle.addTranslationResult(result);
              }
            } catch (err: unknown) {
              const error = err as Error;
              console.error('Region translation error:', err);
              alert(`Translation failed: ${error.message || 'Unknown error'}`);
            }
          },
          () => {
            // Cancelled
          }
        );
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'CANCEL_REGION_SELECTION': {
        regionSelector.cancel();
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      case 'TRIGGER_VIEWPORT_SCREENSHOT': {
        (async () => {
          try {
            // Temporarily hide extension UI before capturing visible viewport
            host.style.visibility = 'hidden';
            const settings = await storageService.getSettings();

            const resp: ExtensionResponse<string> = await chrome.runtime.sendMessage({
              type: 'CAPTURE_VISIBLE_TAB',
              payload: {
                format: settings.screenshotFormat,
                quality: settings.screenshotQuality
              }
            } as ExtensionMessage);

            host.style.visibility = 'visible';

            if (!resp.success || !resp.data) {
              throw new Error(resp.error || 'Failed to capture viewport');
            }

            const dpr = window.devicePixelRatio || 1;
            if (appHandle) {
              appHandle.showScreenshotPreview({
                dataUrl: resp.data,
                format: settings.screenshotFormat,
                width: Math.round(window.innerWidth * dpr),
                height: Math.round(window.innerHeight * dpr),
                timestamp: Date.now()
              });
            }
            sendResponse({ success: true } as ExtensionResponse);
          } catch (err: unknown) {
            host.style.visibility = 'visible';
            const error = err as Error;
            sendResponse({ success: false, error: error.message } as ExtensionResponse);
          }
        })();
        return true;
      }

      case 'TRIGGER_FULLPAGE_SCREENSHOT': {
        (async () => {
          try {
            const ss = await fullPageCapturer.captureFullPage();
            if (appHandle) {
              appHandle.showScreenshotPreview(ss);
            }
            sendResponse({ success: true } as ExtensionResponse);
          } catch (err: unknown) {
            const error = err as Error;
            sendResponse({ success: false, error: error.message } as ExtensionResponse);
          }
        })();
        return true;
      }

      case 'TRANSLATE_SELECTED_TEXT': {
        const payload = message.payload as TranslateSelectionPayload;
        if (payload?.text) {
          (async () => {
            try {
              const res = await geminiClient.translateRegionText(payload.text);
              const settings = await storageService.getSettings();
              if (appHandle) {
                appHandle.addTranslationResult({
                  id: `trans_${Date.now()}`,
                  sourceText: payload.text,
                  translatedText: res.translation,
                  sourceLanguage: res.sourceLanguage,
                  targetLanguage: res.targetLanguage || settings.targetLanguage,
                  explanations: res.explanations || [],
                  timestamp: Date.now(),
                  isVisual: false
                });
              }
            } catch (err: unknown) {
              const error = err as Error;
              console.error('Failed to translate selected text:', err);
              alert(`Translation failed: ${error.message || 'Unknown error'}`);
            }
          })();
        }
        sendResponse({ success: true } as ExtensionResponse);
        return true;
      }

      default:
        break;
    }
  });
})();
