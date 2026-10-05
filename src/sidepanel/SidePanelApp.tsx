import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Send,
  Languages,
  Settings as SettingsIcon,
  Loader2,
  FileText
} from 'lucide-react';
import { storageService } from '../services/storage/storage-service';
import { SUPPORTED_LANGUAGES } from '../services/storage/defaults';
import { ExtensionSettings } from '../types/settings';
import { geminiClient } from '../services/gemini/client';
import { isPdfUrl } from '../services/pdf/pdf-utils';
import { TermExplanation } from '../types/gemini';

interface ActiveTranslation {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage?: string;
  targetLanguage: string;
  explanations?: TermExplanation[];
  timestamp: number;
}

export const SidePanelApp: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [targetLang, setTargetLang] = useState('fa');
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [isPdf, setIsPdf] = useState(false);

  // Active translation
  const [currentTranslation, setCurrentTranslation] = useState<ActiveTranslation | null>(null);
  const [inputText, setInputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);

  // History
  const [history, setHistory] = useState<ActiveTranslation[]>([]);

  useEffect(() => {
    storageService.getSettings().then((s) => {
      setSettings(s);
      if (s.targetLanguage) setTargetLang(s.targetLanguage);
    });

    // Check active tab
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url) {
        setActiveTabUrl(tab.url);
        setIsPdf(isPdfUrl(tab.url) || Boolean(tab.title?.toLowerCase().endsWith('.pdf')));
      }
    });

    // Load any previously saved selection translation
    chrome.storage.local.get(['latest_selection_translation'], (result) => {
      if (result.latest_selection_translation) {
        setCurrentTranslation(result.latest_selection_translation);
      }
    });

    // Listen for live updates from background worker or content scripts
    const messageListener = (msg: { type: string; payload: ActiveTranslation }) => {
      if (msg.type === 'SELECTION_TRANSLATED_BACKEND' && msg.payload) {
        setCurrentTranslation(msg.payload);
        setHistory((prev) => [msg.payload, ...prev.slice(0, 9)]);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleTranslateInput = async () => {
    if (!inputText.trim() || isTranslating) return;
    setIsTranslating(true);

    try {
      const res = await geminiClient.translateRegionText(inputText.trim(), {
        targetLanguage: targetLang
      });

      const newTrans: ActiveTranslation = {
        id: `sp_${Date.now()}`,
        sourceText: inputText.trim(),
        translatedText: res.translation,
        sourceLanguage: res.sourceLanguage,
        targetLanguage: res.targetLanguage || targetLang,
        explanations: res.explanations || [],
        timestamp: Date.now()
      };

      setCurrentTranslation(newTrans);
      setHistory((prev) => [newTrans, ...prev.slice(0, 9)]);
      setInputText('');
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Translation failed: ${error.message || 'Network error'}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenPdfReader = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL(
        `pdf-viewer.html${activeTabUrl ? `?src=${encodeURIComponent(activeTabUrl)}` : ''}`
      )
    });
  };

  const isPersian = targetLang === 'fa';

  return (
    <div className="sp-container">
      {/* Header */}
      <header className="sp-header">
        <div className="sp-brand">
          <Sparkles size={16} />
          <span>Gemini Side Translator</span>
          {settings?.geminiModel && (
            <span style={{ fontSize: '10px', color: '#a78bfa', background: 'rgba(167, 139, 250, 0.15)', padding: '2px 5px', borderRadius: '4px' }}>
              {settings.geminiModel.replace('gemini-', '')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid #334155',
              color: '#f8fafc',
              padding: '4px 6px',
              borderRadius: 6,
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>

          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4
            }}
            title="Settings"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </header>

      {/* PDF Detected Banner */}
      {isPdf && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 8,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, color: '#93c5fd' }}>
            <FileText size={14} />
            <span>PDF Document Open</span>
          </div>
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
            Read this PDF with full-page parallel translation in the AI Reader.
          </p>
          <button
            onClick={handleOpenPdfReader}
            className="sp-btn sp-btn-primary"
            style={{ padding: '6px 10px', fontSize: '11px', marginTop: 2 }}
          >
            <BookOpen size={13} />
            <span>Open in AI PDF Reader</span>
          </button>
        </div>
      )}

      {/* Direct Translate Input */}
      <div className="sp-card">
        <textarea
          className="sp-textarea"
          placeholder="Paste or type text from PDF to translate..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              handleTranslateInput();
            }
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="sp-btn sp-btn-primary"
            onClick={handleTranslateInput}
            disabled={!inputText.trim() || isTranslating}
          >
            {isTranslating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Translating...</span>
              </>
            ) : (
              <>
                <Send size={13} />
                <span>Translate</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Current Translation Result Card */}
      {currentTranslation && (
        <div className="sp-card" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="sp-card-header">
            <span>Result</span>
            <button
              onClick={() => handleCopy(currentTranslation.translatedText)}
              style={{
                background: 'none',
                border: 'none',
                color: copied ? '#10b981' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '11px'
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="sp-text-original">{currentTranslation.sourceText}</div>

          <div className={`sp-text-translated ${isPersian ? 'rtl' : ''}`}>
            {currentTranslation.translatedText}
          </div>

          {currentTranslation.explanations && currentTranslation.explanations.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#a78bfa' }}>
                Key Technical Terms:
              </span>
              {currentTranslation.explanations.map((exp, idx) => (
                <div key={idx} className="sp-term">
                  <div className="sp-term-title">{exp.term}</div>
                  <div className="sp-term-desc">{exp.meaning}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fallback tip when empty */}
      {!currentTranslation && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#64748b',
            padding: 20
          }}
        >
          <Languages size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: '12px', lineHeight: 1.5 }}>
            Highlight text in any PDF or web page, then right-click &quot;Translate selected text with Gemini&quot; to see live translations here!
          </p>
        </div>
      )}
      {/* Recent History */}
      {history.length > 1 && (
        <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #334155' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>Recent Translations:</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
            {history.slice(1, 5).map((item) => (
              <div
                key={item.id}
                onClick={() => setCurrentTranslation(item)}
                style={{
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
              >
                <div style={{ color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.sourceText}
                </div>
                <div style={{ color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.translatedText}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
