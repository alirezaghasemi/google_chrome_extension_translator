import React, { useState, useEffect } from 'react';
import { ExtensionSettings, ExplanationLevel } from '../types/settings';
import { storageService } from '../services/storage/storage-service';
import { SUPPORTED_LANGUAGES } from '../services/storage/defaults';
import { getI18n, isRtl } from '../i18n/i18n';
import {
  Languages,
  Crop,
  Camera,
  Layers,
  Settings as SettingsIcon,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Globe,
  BookOpen,
  FileText,
  PanelRight
} from 'lucide-react';
import { isPdfUrl } from '../services/pdf/pdf-utils';
import { ExtensionMessage, ExtensionResponse, PageTranslationStateResponse } from '../types/messages';

export const Popup: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [isTranslated, setIsTranslated] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    storageService.getSettings().then(setSettings);

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab) {
        if (tab.id) setActiveTabId(tab.id);
        if (tab.url) {
          setActiveTabUrl(tab.url);
          const isPdfDoc = isPdfUrl(tab.url) || Boolean(tab.title?.toLowerCase().endsWith('.pdf'));
          setIsPdf(isPdfDoc);
        }

        if (tab.id) {
          chrome.tabs
            .sendMessage(tab.id, { type: 'GET_PAGE_TRANSLATION_STATE' } as ExtensionMessage)
            .then((resp: ExtensionResponse<PageTranslationStateResponse>) => {
              if (resp?.success && resp.data) {
                setIsTranslated(resp.data.isTranslated);
                setIsTranslating(resp.data.progress.status === 'translating');
              }
            })
            .catch(() => {
              // Tab may not have content script (e.g. PDF tab or chrome://)
            });
        }
      }
    });
  }, []);

  if (!settings) return null;

  const t = getI18n(settings.uiLanguage);
  const rtl = isRtl(settings.uiLanguage);
  const hasApiKey = Boolean(settings.geminiApiKey && settings.geminiApiKey.trim().length > 0);

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleUpdateSetting = async <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    const updated = await storageService.saveSettings({ [key]: value });
    setSettings(updated);
  };

  const handleTranslatePage = async () => {
    if (!activeTabId) return;
    try {
      if (isTranslated) {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'RESTORE_ORIGINAL_PAGE'
        } as ExtensionMessage);
        setIsTranslated(false);
        setIsTranslating(false);
      } else {
        await chrome.tabs.sendMessage(activeTabId, {
          type: 'START_PAGE_TRANSLATION',
          payload: { targetLanguage: settings.targetLanguage }
        } as ExtensionMessage);
        setIsTranslating(true);
        window.close();
      }
    } catch (err) {
      console.error('Failed to communicate with tab:', err);
    }
  };

  const handleTranslateRegion = async () => {
    if (!activeTabId) return;
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'START_REGION_SELECTION'
    } as ExtensionMessage);
    window.close();
  };

  const handleCaptureViewport = async () => {
    if (!activeTabId) return;
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'TRIGGER_VIEWPORT_SCREENSHOT'
    } as ExtensionMessage);
    window.close();
  };

  const handleCaptureFullPage = async () => {
    if (!activeTabId) return;
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'TRIGGER_FULLPAGE_SCREENSHOT'
    } as ExtensionMessage);
    window.close();
  };

  const handleOpenPdfTranslator = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(
        `pdf-viewer.html${activeTabUrl ? `?src=${encodeURIComponent(activeTabUrl)}` : ''}`
      )
    });
    window.close();
  };

  const handleOpenSidePanel = () => {
    if (activeTabId) {
      const sidePanelAny = (chrome as unknown as { sidePanel?: { open?: (opts: { tabId?: number }) => Promise<void> } }).sidePanel;
      sidePanelAny?.open?.({ tabId: activeTabId });
    }
    window.close();
  };

  const toggleUiLanguage = () => {
    const nextLang = settings.uiLanguage === 'fa' ? 'en' : 'fa';
    handleUpdateSetting('uiLanguage', nextLang);
  };

  return (
    <div className={`popup-container ${rtl ? 'rtl' : ''}`}>
      {/* Header */}
      <div className="popup-header">
        <div className="brand-group">
          <div className="brand-icon">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="brand-title">{t.app.title}</div>
            <div className="brand-subtitle">Gemini {settings.geminiModel.replace('gemini-', '')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button className="header-btn" title="Language (EN / FA)" onClick={toggleUiLanguage}>
            <Globe size={16} />
          </button>
          <button className="header-btn" title={t.actions.settings} onClick={openOptions}>
            <SettingsIcon size={16} />
          </button>
        </div>
      </div>

      {/* API Key Status Banner */}
      {hasApiKey ? (
        <div className="status-banner success">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} />
            <span>{t.status.apiConfigured}</span>
          </div>
        </div>
      ) : (
        <div className="status-banner warning" onClick={openOptions}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} />
            <span>{t.status.apiMissing}</span>
          </div>
          <span style={{ textDecoration: 'underline' }}>Configure</span>
        </div>
      )}

      {/* PDF Detected Banner */}
      {isPdf && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.18))',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="#818cf8" />
            <strong style={{ fontSize: '13px', color: '#c7d2fe' }}>{t.pdf.detected}</strong>
          </div>

          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
            {t.pdf.detectedDesc}
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={handleOpenPdfTranslator}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <BookOpen size={14} />
              <span>{t.pdf.openInReader}</span>
            </button>

            <button
              onClick={handleOpenSidePanel}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
              title={t.pdf.openSidePanel}
            >
              <PanelRight size={14} />
              <span>{t.actions.openSidePanel}</span>
            </button>
          </div>
        </div>
      )}

      {/* Actions Grid */}
      <div className="actions-grid">
        <div className="action-card" onClick={handleTranslatePage}>
          <div className="action-icon-wrap" style={{ background: isTranslated ? '#fee2e2' : undefined, color: isTranslated ? '#ef4444' : undefined }}>
            {isTranslated ? <RotateCcw size={18} /> : <Languages size={18} />}
          </div>
          <div className="action-title">
            {isTranslated ? t.actions.restoreOriginal : isTranslating ? t.actions.pause : t.actions.translatePage}
          </div>
        </div>

        <div className="action-card" onClick={handleTranslateRegion}>
          <div className="action-icon-wrap">
            <Crop size={18} />
          </div>
          <div className="action-title">{t.actions.translateRegion}</div>
        </div>

        <div className="action-card" onClick={handleCaptureViewport}>
          <div className="action-icon-wrap">
            <Camera size={18} />
          </div>
          <div className="action-title">{t.actions.captureViewport}</div>
        </div>

        <div className="action-card" onClick={handleCaptureFullPage}>
          <div className="action-icon-wrap">
            <Layers size={18} />
          </div>
          <div className="action-title">{t.actions.captureFullPage}</div>
        </div>
      </div>

      {/* Quick Settings */}
      <div className="quick-settings">
        {/* Target Language */}
        <div className="setting-row">
          <span className="setting-label">
            <Languages size={14} />
            {t.settings.general.targetLang}
          </span>
          <select
            className="select-input"
            value={settings.targetLanguage}
            onChange={(e) => handleUpdateSetting('targetLanguage', e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.native} ({lang.name})
              </option>
            ))}
          </select>
        </div>

        {/* Explain Terms Toggle */}
        <div className="setting-row">
          <span className="setting-label">
            <Sparkles size={14} />
            {t.settings.translation.explainTerms}
          </span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.explainTerms}
              onChange={(e) => handleUpdateSetting('explainTerms', e.target.checked)}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Explanation Level */}
        {settings.explainTerms && (
          <div className="setting-row">
            <span className="setting-label">{t.settings.translation.explainLevel}</span>
            <select
              className="select-input"
              value={settings.explanationLevel}
              onChange={(e) =>
                handleUpdateSetting('explanationLevel', e.target.value as ExplanationLevel)
              }
            >
              <option value="important">{t.settings.translation.levelImportant}</option>
              <option value="technical">{t.settings.translation.levelTechnical}</option>
              <option value="detailed">{t.settings.translation.levelDetailed}</option>
            </select>
          </div>
        )}

        {/* Panel Opacity */}
        <div className="setting-row">
          <span className="setting-label">{t.settings.panel.opacity}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={settings.panelOpacity}
              onChange={(e) => handleUpdateSetting('panelOpacity', parseFloat(e.target.value))}
              style={{ width: '80px', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', minWidth: '32px' }}>
              {Math.round(settings.panelOpacity * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Quick Launch PDF Translator */}
      {!isPdf && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={handleOpenPdfTranslator}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px dashed rgba(99, 102, 241, 0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#818cf8',
              cursor: 'pointer'
            }}
          >
            <BookOpen size={14} />
            <span>{t.actions.openPdfTranslator}...</span>
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="popup-footer">
        <span>Alt+Shift+T: Page • Alt+Shift+R: Region</span>
      </div>
    </div>
  );
};
