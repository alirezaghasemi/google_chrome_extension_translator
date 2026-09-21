import React, { useState, useEffect } from 'react';
import {
  ExtensionSettings,
  ExplanationLevel,
  TranslationStyle,
  PanelPosition,
  ScreenshotFormat,
  GeminiModel
} from '../types/settings';
import { storageService } from '../services/storage/storage-service';
import { geminiClient } from '../services/gemini/client';
import { SUPPORTED_LANGUAGES, GEMINI_MODELS } from '../services/storage/defaults';
import { getI18n, isRtl } from '../i18n/i18n';
import {
  Sparkles,
  Sliders,
  Languages,
  Layout,
  Camera,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react';

type SettingsTab = 'ai' | 'general' | 'translation' | 'panel' | 'screenshot' | 'privacy';

export const Options: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);

  useEffect(() => {
    storageService.getSettings().then((loaded) => {
      setSettings(loaded);
      setApiKeyInput(loaded.geminiApiKey || '');
    });
  }, []);

  if (!settings) return null;

  const t = getI18n(settings.uiLanguage);
  const rtl = isRtl(settings.uiLanguage);

  const handleUpdate = async <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    const updated = await storageService.saveSettings({ [key]: value });
    setSettings(updated);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  };

  const handleSaveApiKey = async () => {
    await handleUpdate('geminiApiKey', apiKeyInput.trim());
  };

  const handleDeleteApiKey = async () => {
    if (confirm('Are you sure you want to delete your stored Gemini API key?')) {
      await storageService.deleteApiKey();
      setApiKeyInput('');
      setSettings((s) => (s ? { ...s, geminiApiKey: '' } : null));
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    const keyToTest = apiKeyInput.trim() || settings.geminiApiKey;
    if (!keyToTest) {
      setTestResult({ valid: false, message: 'Please enter an API key first' });
      return;
    }

    setIsTestingKey(true);
    setTestResult(null);

    const res = await geminiClient.validateApiKey(keyToTest, settings.geminiModel);
    setIsTestingKey(false);

    if (res.valid) {
      setTestResult({
        valid: true,
        message: `Successfully connected to Gemini using ${res.model}!`
      });
      // Automatically save valid key
      handleUpdate('geminiApiKey', keyToTest);
    } else {
      setTestResult({
        valid: false,
        message: res.error || 'Connection failed'
      });
    }
  };

  const positionPresets: Array<{ id: PanelPosition; label: string }> = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-center', label: 'Top Center' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'center-left', label: 'Center Left' },
    { id: 'center', label: 'Center' },
    { id: 'center-right', label: 'Center Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-center', label: 'Bottom Center' },
    { id: 'bottom-right', label: 'Bottom Right' }
  ];

  return (
    <div className={`options-layout ${rtl ? 'rtl' : ''}`}>
      {/* Sidebar Navigation */}
      <aside className="options-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon-lg">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="brand-title-lg">{t.app.title}</div>
            <div className="brand-ver">Manifest V3 • v1.0.0</div>
          </div>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Sparkles size={16} />
            <span>{t.settings.tabs.ai}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Sliders size={16} />
            <span>{t.settings.tabs.general}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'translation' ? 'active' : ''}`}
            onClick={() => setActiveTab('translation')}
          >
            <Languages size={16} />
            <span>{t.settings.tabs.translation}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'panel' ? 'active' : ''}`}
            onClick={() => setActiveTab('panel')}
          >
            <Layout size={16} />
            <span>{t.settings.tabs.panel}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'screenshot' ? 'active' : ''}`}
            onClick={() => setActiveTab('screenshot')}
          >
            <Camera size={16} />
            <span>{t.settings.tabs.screenshot}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
          >
            <ShieldCheck size={16} />
            <span>{t.settings.tabs.privacy}</span>
          </button>
        </nav>

        {saveFeedback && (
          <div style={{ marginTop: 'auto', padding: '8px 12px', background: '#dcfce7', color: '#16a34a', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} />
            <span>{t.actions.saved}</span>
          </div>
        )}
      </aside>

      {/* Main Content View */}
      <main className="options-content">
        {/* TAB 1: AI & GEMINI */}
        {activeTab === 'ai' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.ai}</h1>
              <p className="content-desc">Configure your Google AI Studio API key and model parameters.</p>
            </div>

            <div className="settings-section-card">
              <div className="section-card-title">Google AI Studio API Key</div>

              <div className="form-group">
                <label className="form-label">{t.settings.ai.apiKey}</label>
                <div className="api-key-wrap">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="text-input"
                    placeholder="AIzaSy..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title="Toggle Visibility"
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveApiKey}>
                    {t.actions.save}
                  </button>
                  {settings.geminiApiKey && (
                    <button className="btn btn-danger" onClick={handleDeleteApiKey} title={t.actions.deleteKey}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="form-hint">{t.settings.ai.apiKeyHint}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleTestConnection}
                  disabled={isTestingKey}
                >
                  {isTestingKey && <Loader2 size={14} className="animate-spin" />}
                  {isTestingKey ? t.status.testing : t.actions.testConnection}
                </button>
              </div>

              {testResult && (
                <div className={`alert-box ${testResult.valid ? 'alert-success' : 'alert-error'}`}>
                  {testResult.valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="settings-section-card">
              <div className="section-card-title">Model Configuration</div>

              <div className="form-group">
                <label className="form-label">{t.settings.ai.model}</label>
                <select
                  className="select-input-lg"
                  value={settings.geminiModel}
                  onChange={(e) => handleUpdate('geminiModel', e.target.value as GeminiModel)}
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t.settings.ai.temperature}: {settings.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.temperature}
                  onChange={(e) => handleUpdate('temperature', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t.settings.ai.timeout}</label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  className="text-input"
                  value={settings.requestTimeout / 1000}
                  onChange={(e) => handleUpdate('requestTimeout', parseInt(e.target.value || '30') * 1000)}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GENERAL */}
        {activeTab === 'general' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.general}</h1>
              <p className="content-desc">Configure extension language, default targets, and appearance.</p>
            </div>

            <div className="settings-section-card">
              <div className="form-group">
                <label className="form-label">{t.settings.general.uiLang}</label>
                <select
                  className="select-input-lg"
                  value={settings.uiLanguage}
                  onChange={(e) => handleUpdate('uiLanguage', e.target.value as 'en' | 'fa')}
                >
                  <option value="fa">فارسی (Persian / RTL)</option>
                  <option value="en">English (LTR)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.settings.general.targetLang}</label>
                <select
                  className="select-input-lg"
                  value={settings.targetLanguage}
                  onChange={(e) => handleUpdate('targetLanguage', e.target.value)}
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.native} ({l.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.settings.general.theme}</label>
                <select
                  className="select-input-lg"
                  value={settings.theme}
                  onChange={(e) => handleUpdate('theme', e.target.value as 'system' | 'dark' | 'light')}
                >
                  <option value="system">{t.settings.general.system}</option>
                  <option value="dark">{t.settings.general.dark}</option>
                  <option value="light">{t.settings.general.light}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TRANSLATION */}
        {activeTab === 'translation' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.translation}</h1>
              <p className="content-desc">Adjust AI translation behavior and terminology explanation depth.</p>
            </div>

            <div className="settings-section-card">
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.explainTerms}
                    onChange={(e) => handleUpdate('explainTerms', e.target.checked)}
                  />
                  <span>{t.settings.translation.explainTerms}</span>
                </label>
              </div>

              {settings.explainTerms && (
                <div className="form-group">
                  <label className="form-label">{t.settings.translation.explainLevel}</label>
                  <select
                    className="select-input-lg"
                    value={settings.explanationLevel}
                    onChange={(e) =>
                      handleUpdate('explanationLevel', e.target.value as ExplanationLevel)
                    }
                  >
                    <option value="none">{t.settings.translation.levelNone}</option>
                    <option value="important">{t.settings.translation.levelImportant}</option>
                    <option value="technical">{t.settings.translation.levelTechnical}</option>
                    <option value="detailed">{t.settings.translation.levelDetailed}</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">{t.settings.translation.style}</label>
                <select
                  className="select-input-lg"
                  value={settings.translationStyle}
                  onChange={(e) =>
                    handleUpdate('translationStyle', e.target.value as TranslationStyle)
                  }
                >
                  <option value="natural">{t.settings.translation.styleNatural}</option>
                  <option value="literal">{t.settings.translation.styleLiteral}</option>
                  <option value="professional">{t.settings.translation.styleProfessional}</option>
                  <option value="technical">{t.settings.translation.styleTechnical}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.preserveCode}
                    onChange={(e) => handleUpdate('preserveCode', e.target.checked)}
                  />
                  <span>{t.settings.translation.preserveCode}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RESULT PANEL */}
        {activeTab === 'panel' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.panel}</h1>
              <p className="content-desc">Customize floating panel layout, position presets, and transparency.</p>
            </div>

            <div className="settings-section-card">
              <div className="form-group">
                <label className="form-label">{t.settings.panel.position}</label>
                <div className="position-grid">
                  {positionPresets.map((p) => (
                    <button
                      key={p.id}
                      className={`pos-btn ${settings.panelPosition === p.id ? 'active' : ''}`}
                      onClick={() => handleUpdate('panelPosition', p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.rememberPosition}
                    onChange={(e) => handleUpdate('rememberPosition', e.target.checked)}
                  />
                  <span>{t.settings.panel.remember}</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.enableDragging}
                    onChange={(e) => handleUpdate('enableDragging', e.target.checked)}
                  />
                  <span>{t.settings.panel.draggable}</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">
                  {t.settings.panel.opacity}: {Math.round(settings.panelOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={settings.panelOpacity}
                  onChange={(e) => handleUpdate('panelOpacity', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">{t.settings.panel.width}</label>
                  <input
                    type="number"
                    min="280"
                    max="800"
                    className="text-input"
                    value={settings.panelWidth}
                    onChange={(e) => handleUpdate('panelWidth', parseInt(e.target.value || '420'))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{t.settings.panel.maxHeight}</label>
                  <input
                    type="number"
                    min="200"
                    max="1000"
                    className="text-input"
                    value={settings.panelMaxHeight}
                    onChange={(e) => handleUpdate('panelMaxHeight', parseInt(e.target.value || '520'))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SCREENSHOT */}
        {activeTab === 'screenshot' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.screenshot}</h1>
              <p className="content-desc">Configure capture formats and full-page scrolling parameters.</p>
            </div>

            <div className="settings-section-card">
              <div className="form-group">
                <label className="form-label">{t.settings.screenshot.format}</label>
                <select
                  className="select-input-lg"
                  value={settings.screenshotFormat}
                  onChange={(e) =>
                    handleUpdate('screenshotFormat', e.target.value as ScreenshotFormat)
                  }
                >
                  <option value="png">PNG (Lossless)</option>
                  <option value="jpeg">JPEG (Compressed)</option>
                </select>
              </div>

              {settings.screenshotFormat === 'jpeg' && (
                <div className="form-group">
                  <label className="form-label">
                    {t.settings.screenshot.quality}: {Math.round(settings.screenshotQuality * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0.4"
                    max="1"
                    step="0.05"
                    value={settings.screenshotQuality}
                    onChange={(e) => handleUpdate('screenshotQuality', parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">{t.settings.screenshot.delay}</label>
                <input
                  type="number"
                  min="150"
                  max="2000"
                  step="50"
                  className="text-input"
                  value={settings.fullPageCaptureDelay}
                  onChange={(e) =>
                    handleUpdate('fullPageCaptureDelay', parseInt(e.target.value || '350'))
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={settings.autoRestoreScroll}
                    onChange={(e) => handleUpdate('autoRestoreScroll', e.target.checked)}
                  />
                  <span>{t.settings.screenshot.autoRestore}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: PRIVACY */}
        {activeTab === 'privacy' && (
          <div>
            <div className="content-header">
              <h1 className="content-title">{t.settings.tabs.privacy}</h1>
              <p className="content-desc">Transparent information about your security and data confidentiality.</p>
            </div>

            <div className="settings-section-card">
              <div className="section-card-title">{t.settings.privacy.title}</div>
              <p style={{ marginBottom: 12 }}>{t.settings.privacy.p1}</p>
              <p style={{ marginBottom: 12 }}>{t.settings.privacy.p2}</p>
              <p>{t.settings.privacy.p3}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
