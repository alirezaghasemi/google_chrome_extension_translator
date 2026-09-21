import { storageService } from '../services/storage/storage-service';
import { geminiClient } from '../services/gemini/client';
import {
  ExtensionMessage,
  ExtensionResponse,
  CaptureVisibleTabPayload,
  SaveSettingsPayload,
  ValidateApiKeyPayload
} from '../types/messages';

// Initialize context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'antigravity_translate_selection',
    title: 'Translate selected text with Gemini',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'antigravity_translate_page',
    title: 'Translate this entire page',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'antigravity_translate_region',
    title: 'Translate selected region...',
    contexts: ['page']
  });
});

// Context menu click dispatcher
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    if (info.menuItemId === 'antigravity_translate_selection' && info.selectionText) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'TRANSLATE_SELECTED_TEXT',
        payload: { text: info.selectionText }
      } as ExtensionMessage);
    } else if (info.menuItemId === 'antigravity_translate_page') {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_PAGE_TRANSLATION'
      } as ExtensionMessage);
    } else if (info.menuItemId === 'antigravity_translate_region') {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_REGION_SELECTION'
      } as ExtensionMessage);
    }
  } catch (err) {
    console.warn('Could not dispatch context menu to tab (script might not be loaded):', err);
  }
});

// Keyboard command shortcuts handler
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    if (command === 'translate-page') {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_PAGE_TRANSLATION' } as ExtensionMessage);
    } else if (command === 'translate-region') {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_REGION_SELECTION' } as ExtensionMessage);
    } else if (command === 'capture-screenshot') {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_VIEWPORT_SCREENSHOT' } as ExtensionMessage);
    }
  } catch (err) {
    console.warn(`Command "${command}" failed on tab:`, err);
  }
});

// Runtime message handler
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'CAPTURE_VISIBLE_TAB': {
      const payload = message.payload as CaptureVisibleTabPayload;
      const format = payload?.format === 'jpeg' ? 'jpeg' : 'png';
      const quality = payload?.quality ? Math.round(payload.quality * 100) : 92;

      chrome.tabs.captureVisibleTab(
        {
          format,
          ...(format === 'jpeg' ? { quality } : {})
        },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            sendResponse({
              success: false,
              error: chrome.runtime.lastError?.message || 'Failed to capture visible tab'
            } as ExtensionResponse);
          } else {
            sendResponse({ success: true, data: dataUrl } as ExtensionResponse<string>);
          }
        }
      );
      return true; // Async sendResponse
    }

    case 'GET_SETTINGS': {
      storageService
        .getSettings()
        .then((settings) => sendResponse({ success: true, data: settings }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'SAVE_SETTINGS': {
      const payload = message.payload as SaveSettingsPayload;
      storageService
        .saveSettings(payload.settings)
        .then((updated) => sendResponse({ success: true, data: updated }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'VALIDATE_API_KEY': {
      const payload = message.payload as ValidateApiKeyPayload;
      geminiClient
        .validateApiKey(payload.apiKey, payload.model)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    case 'OPEN_OPTIONS_PAGE': {
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      return true;
    }

    default:
      break;
  }
});
