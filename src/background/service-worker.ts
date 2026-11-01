import { storageService } from '../services/storage/storage-service';
import { geminiClient } from '../services/gemini/client';
import { isPdfUrl } from '../services/pdf/pdf-utils';
import {
  ExtensionMessage,
  ExtensionResponse,
  CaptureVisibleTabPayload,
  SaveSettingsPayload,
  ValidateApiKeyPayload,
  OpenPdfTranslatorPayload,
  OpenSidePanelPayload,
  TranslateTextDirectPayload
} from '../types/messages';

// Initialize context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'antigravity_translate_selection',
    title: 'Translate selected text with Gemini',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'antigravity_open_pdf_translator',
    title: 'Open in AI PDF Translator & Reader',
    contexts: ['page', 'link', 'action']
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

/**
 * Opens the built-in AI PDF Translator tab.
 */
function openPdfTranslatorTab(url?: string): void {
  const viewerUrl = chrome.runtime.getURL(
    `pdf-viewer.html${url ? `?src=${encodeURIComponent(url)}` : ''}`
  );
  chrome.tabs.create({ url: viewerUrl });
}

/**
 * Captures the visible tab and opens the dedicated PDF Snipper tool.
 */
async function launchPdfSnipper(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab?.windowId) return;

  chrome.tabs.captureVisibleTab(
    tab.windowId,
    { format: 'png' },
    async (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        console.error('Failed to capture PDF tab for snipping:', chrome.runtime.lastError?.message);
        return;
      }

      await chrome.storage.local.set({
        antigravity_snip_data: {
          image: dataUrl,
          title: tab.title || 'PDF Document',
          url: tab.url,
          timestamp: Date.now()
        }
      });

      chrome.tabs.create({
        url: chrome.runtime.getURL('snip.html'),
        index: (tab.index ?? 0) + 1
      });
    }
  );
}

/**
 * Initiates region selection with fallback to PDF Snipper if content script is unavailable.
 */
async function startRegionTranslationFlow(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id) return;

  const isPdf = isPdfUrl(tab.url) || Boolean(tab.title?.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    if (tab.url?.includes('pdf-viewer.html')) {
      chrome.tabs.sendMessage(tab.id, { type: 'START_REGION_SELECTION' } as ExtensionMessage).catch(() => {});
      return;
    }
    await launchPdfSnipper(tab);
    return;
  }

  // Regular web page - attempt content script first
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'START_REGION_SELECTION'
    } as ExtensionMessage);

    if (!resp?.success) {
      await launchPdfSnipper(tab);
    }
  } catch {
    await launchPdfSnipper(tab);
  }
}

/**
 * Handles text selection translation with graceful fallback for PDF tabs and restricted pages.
 */
async function handleSelectionTranslation(selectionText: string, tab: chrome.tabs.Tab): Promise<void> {
  if (!tab?.id || !selectionText?.trim()) return;

  let deliveredToContentScript = false;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'TRANSLATE_SELECTED_TEXT',
      payload: { text: selectionText }
    } as ExtensionMessage);

    if (resp?.success) {
      deliveredToContentScript = true;
    }
  } catch {
    deliveredToContentScript = false;
  }

  // If content script was not reachable (e.g. Chrome's built-in PDF viewer or file:// without injection)
  if (!deliveredToContentScript) {
    try {
      const settings = await storageService.getSettings();
      const translation = await geminiClient.translateRegionText(selectionText);

      const translationData = {
        id: `trans_${Date.now()}`,
        sourceText: selectionText,
        translatedText: translation.translation,
        sourceLanguage: translation.sourceLanguage,
        targetLanguage: translation.targetLanguage || settings.targetLanguage,
        explanations: translation.explanations || [],
        timestamp: Date.now(),
        isVisual: false
      };

      await chrome.storage.local.set({
        latest_selection_translation: translationData
      });

      // Try opening the Chrome SidePanel
      try {
        const sidePanelAny = (chrome as unknown as { sidePanel?: { open?: (opts: { tabId?: number; windowId?: number }) => Promise<void> } }).sidePanel;
        if (sidePanelAny?.open) {
          await sidePanelAny.open({ tabId: tab.id });
        }
      } catch (sidePanelErr) {
        console.warn('Could not open side panel:', sidePanelErr);
      }

      // Notify any open views (SidePanel, Popup, etc.)
      chrome.runtime.sendMessage({
        type: 'SELECTION_TRANSLATED_BACKEND',
        payload: translationData
      }).catch(() => {
        // No listener active, safe to ignore
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Background selection translation failed:', error);
      if (chrome.notifications?.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Gemini Translation',
          message: error.message || 'Translation failed'
        });
      }
    }
  }
}

// Context menu click dispatcher
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    if (info.menuItemId === 'antigravity_open_pdf_translator') {
      const targetUrl = info.linkUrl || info.pageUrl || tab.url;
      openPdfTranslatorTab(targetUrl);
      return;
    }

    if (info.menuItemId === 'antigravity_translate_selection' && info.selectionText) {
      await handleSelectionTranslation(info.selectionText, tab);
      return;
    }

    if (info.menuItemId === 'antigravity_translate_page') {
      if (isPdfUrl(tab.url)) {
        openPdfTranslatorTab(tab.url);
        return;
      }
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_PAGE_TRANSLATION'
      } as ExtensionMessage);
      return;
    }

    if (info.menuItemId === 'antigravity_translate_region') {
      await startRegionTranslationFlow(tab);
      return;
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
      if (isPdfUrl(tab.url)) {
        openPdfTranslatorTab(tab.url);
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: 'START_PAGE_TRANSLATION' } as ExtensionMessage);
    } else if (command === 'translate-region') {
      await startRegionTranslationFlow(tab);
    } else if (command === 'capture-screenshot') {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_VIEWPORT_SCREENSHOT' } as ExtensionMessage);
    } else if (command === 'capture-fullpage') {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_FULLPAGE_SCREENSHOT' } as ExtensionMessage);
    }
  } catch (err) {
    console.warn(`Command "${command}" failed on tab:`, err);
  }
});

// Runtime message handler
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'LAUNCH_PDF_SNIPPER': {
      const payload = message.payload as { tabId?: number };
      const targetTabId = payload?.tabId || sender?.tab?.id;
      if (targetTabId) {
        chrome.tabs.get(targetTabId, (targetTab) => {
          if (targetTab) {
            launchPdfSnipper(targetTab);
          }
        });
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
          if (activeTab) {
            launchPdfSnipper(activeTab);
          }
        });
      }
      sendResponse({ success: true } as ExtensionResponse);
      return true;
    }

    case 'OPEN_PDF_TRANSLATOR': {
      const payload = message.payload as OpenPdfTranslatorPayload;
      openPdfTranslatorTab(payload?.url);
      sendResponse({ success: true } as ExtensionResponse);
      return true;
    }

    case 'OPEN_SIDE_PANEL': {
      const payload = message.payload as OpenSidePanelPayload;
      const targetTabId = payload?.tabId || sender?.tab?.id;
      const sidePanelAny = (chrome as unknown as { sidePanel?: { open?: (opts: { tabId?: number; windowId?: number }) => Promise<void> } }).sidePanel;
      if (sidePanelAny?.open && targetTabId) {
        sidePanelAny.open({ tabId: targetTabId })
          .then(() => sendResponse({ success: true }))
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: false, error: 'SidePanel API not available' });
      }
      return true;
    }

    case 'TRANSLATE_TEXT_DIRECT': {
      const payload = message.payload as TranslateTextDirectPayload;
      geminiClient
        .translateRegionText(payload.text, { targetLanguage: payload.targetLanguage })
        .then((result) => sendResponse({ success: true, data: result } as ExtensionResponse))
        .catch((err: Error) => sendResponse({ success: false, error: err.message } as ExtensionResponse));
      return true;
    }

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
