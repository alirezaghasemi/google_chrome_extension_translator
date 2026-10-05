import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  Languages,
  Sparkles,
  Download,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Upload,
  BookOpen,
  Settings as SettingsIcon,
  RotateCcw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { PdfLoader } from '../services/pdf/pdf-loader';
import { pdfDocumentTranslator, PageTranslationResult } from '../services/pdf/pdf-translator-service';
import { getPdfFileName } from '../services/pdf/pdf-utils';
import { storageService } from '../services/storage/storage-service';
import { SUPPORTED_LANGUAGES } from '../services/storage/defaults';
import { ExtensionSettings } from '../types/settings';
import { geminiClient } from '../services/gemini/client';
import { TermExplanation } from '../types/gemini';

export const PdfViewerApp: React.FC = () => {
  const [loader] = useState(() => new PdfLoader());
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);

  // Document state
  const [pdfTitle, setPdfTitle] = useState('Document.pdf');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pagination & Zoom
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.4);

  // Translation State
  const [targetLang, setTargetLang] = useState('fa');
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);
  const [isTranslatingDoc, setIsTranslatingDoc] = useState(false);
  const [docProgress, setDocProgress] = useState(0);

  // Current page text & translation
  const [currentParagraphs, setCurrentParagraphs] = useState<string[]>([]);
  const [currentTranslation, setCurrentTranslation] = useState<PageTranslationResult | null>(null);

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);

  // Copied indicator
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Selection popup
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string;
    translation?: string;
    explanations?: TermExplanation[];
    x: number;
    y: number;
    loading: boolean;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load initial settings
  useEffect(() => {
    storageService.getSettings().then((s) => {
      setSettings(s);
      if (s.targetLanguage) {
        setTargetLang(s.targetLanguage);
      }
    });

    // Check for URL query param `src`
    const urlParams = new URLSearchParams(window.location.search);
    const srcUrl = urlParams.get('src');
    if (srcUrl) {
      loadFromUrl(srcUrl);
    }

    return () => {
      loader.destroy();
    };
  }, []);

  // Render canvas & load page paragraphs on page or zoom change
  useEffect(() => {
    if (!isLoaded || !canvasRef.current || currentPage < 1) return;

    let isSubscribed = true;

    loader
      .renderPageToCanvas(currentPage, canvasRef.current, scale)
      .catch((err) => {
        if (isSubscribed) console.error('Canvas render error:', err);
      });

    // Check if we already have this page's translation
    const existing = pdfDocumentTranslator.getPageTranslation(currentPage);
    if (existing) {
      setCurrentParagraphs(existing.originalParagraphs);
      setCurrentTranslation(existing);
    } else {
      loader.extractPageParagraphs(currentPage).then((paras) => {
        if (isSubscribed) {
          setCurrentParagraphs(paras);
          setCurrentTranslation(null);
        }
      });
    }

    return () => {
      isSubscribed = false;
    };
  }, [currentPage, isLoaded, scale]);

  const loadFromUrl = async (url: string) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const fileName = getPdfFileName(url);
      setPdfTitle(fileName);

      const res = await loader.loadDocument(url, fileName);
      setTotalPages(res.numPages);
      setCurrentPage(1);
      setIsLoaded(true);
      pdfDocumentTranslator.reset();
      pdfDocumentTranslator.setTotalPages(res.numPages);
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('Direct URL fetch failed, might need CORS or file permissions:', error);
      setErrorMsg(
        'Could not fetch remote/local PDF automatically due to browser security restrictions. Please drop your PDF file below or select it from your device.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadFromFile = async (file: File) => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const buffer = await file.arrayBuffer();
      const res = await loader.loadDocument(new Uint8Array(buffer), file.name);
      setPdfTitle(file.name);
      setTotalPages(res.numPages);
      setCurrentPage(1);
      setIsLoaded(true);
      pdfDocumentTranslator.reset();
      pdfDocumentTranslator.setTotalPages(res.numPages);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('File load error:', error);
      setErrorMsg(`Failed to open PDF file: ${error.message || 'Invalid PDF'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslateCurrentPage = async () => {
    if (isTranslatingPage || isTranslatingDoc) return;
    setIsTranslatingPage(true);

    try {
      const result = await loader.translatePage(currentPage, targetLang);
      pdfDocumentTranslator.setPageTranslation(currentPage, result);
      setCurrentTranslation(result);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Translation failed: ${error.message || 'Network error'}`);
    } finally {
      setIsTranslatingPage(false);
    }
  };

  const handleTranslateEntirePdf = async () => {
    if (isTranslatingDoc || totalPages <= 0) return;
    setIsTranslatingDoc(true);
    setDocProgress(0);

    try {
      for (let p = 1; p <= totalPages; p++) {
        if (!pdfDocumentTranslator.hasPageTranslation(p)) {
          const res = await loader.translatePage(p, targetLang);
          pdfDocumentTranslator.setPageTranslation(p, res);
          if (p === currentPage) {
            setCurrentTranslation(res);
          }
        }
        setDocProgress(Math.round((p / totalPages) * 100));
      }
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Document translation error on page: ${error.message}`);
    } finally {
      setIsTranslatingDoc(false);
    }
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const handleExportDocument = () => {
    const all = pdfDocumentTranslator.getAllTranslations();
    if (all.size === 0) {
      alert('No translated pages yet. Please translate page(s) before exporting.');
      return;
    }

    let markdown = `# ${pdfTitle}\n\n`;
    for (let p = 1; p <= totalPages; p++) {
      const pageData = all.get(p);
      if (pageData) {
        markdown += `## Page ${p}\n\n`;
        pageData.translatedParagraphs.forEach((para) => {
          markdown += `${para}\n\n`;
        });
      }
    }

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${pdfTitle.replace(/\.pdf$/i, '')}_translated.md`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  // Handle text selection in translated column or canvas
  const handleMouseUp = async (e: React.MouseEvent) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 2 && text.length < 500) {
      const rect = sel?.getRangeAt(0).getBoundingClientRect();
      const x = rect ? rect.left + window.scrollX : e.clientX;
      const y = rect ? rect.bottom + window.scrollY + 8 : e.clientY + 8;

      setSelectionPopover({
        text,
        x: Math.min(x, window.innerWidth - 380),
        y,
        loading: true
      });

      try {
        const res = await geminiClient.translateRegionText(text, { targetLanguage: targetLang });
        setSelectionPopover((prev) =>
          prev && prev.text === text
            ? {
                ...prev,
                translation: res.translation,
                explanations: res.explanations,
                loading: false
              }
            : prev
        );
      } catch {
        setSelectionPopover(null);
      }
    }
  };

  const isPersian = targetLang === 'fa';

  return (
    <div className="pdf-app-container" onMouseUp={handleMouseUp}>
      {/* Top Toolbar */}
      <header className="pdf-toolbar">
        {/* Brand & File info */}
        <div className="pdf-toolbar-group">
          <div className="pdf-logo">
            <BookOpen size={18} />
            <span>AI PDF Translator</span>
            {settings?.geminiModel && (
              <span style={{ fontSize: '10px', color: '#a78bfa', background: 'rgba(167, 139, 250, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                {settings.geminiModel.replace('gemini-', '')}
              </span>
            )}
          </div>

          <span className="pdf-doc-title" title={pdfTitle}>
            {pdfTitle}
          </span>

          <button
            className="pdf-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Open Another PDF"
          >
            <Upload size={14} />
            <span>Open PDF</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFromFile(file);
            }}
          />
        </div>

        {/* Page navigation & Zoom */}
        {isLoaded && (
          <div className="pdf-toolbar-group">
            <button
              className="pdf-btn pdf-btn-icon"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="pdf-page-indicator">
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val >= 1 && val <= totalPages) setCurrentPage(val);
                }}
                className="pdf-page-input"
              />
              <span>of {totalPages}</span>
            </div>

            <button
              className="pdf-btn pdf-btn-icon"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>

            <button
              className="pdf-btn pdf-btn-icon"
              onClick={() => setScale((s) => Math.max(0.8, s - 0.2))}
              title="Zoom Out"
            >
              <ZoomOut size={15} />
            </button>
            <span style={{ fontSize: '12px', color: 'var(--pdf-text-muted)' }}>
              {Math.round((scale / 1.4) * 100)}%
            </span>
            <button
              className="pdf-btn pdf-btn-icon"
              onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}
              title="Zoom In"
            >
              <ZoomIn size={15} />
            </button>
          </div>
        )}

        {/* Language & Actions */}
        <div className="pdf-toolbar-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Languages size={15} color="var(--pdf-text-muted)" />
            <select
              className="pdf-select"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          {isLoaded && (
            <>
              <button
                className="pdf-btn pdf-btn-primary"
                onClick={handleTranslateCurrentPage}
                disabled={isTranslatingPage || isTranslatingDoc}
              >
                {isTranslatingPage ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Translate Page</span>
                  </>
                )}
              </button>

              <button
                className="pdf-btn pdf-btn-accent"
                onClick={handleTranslateEntirePdf}
                disabled={isTranslatingPage || isTranslatingDoc}
              >
                {isTranslatingDoc ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{docProgress}%</span>
                  </>
                ) : (
                  <>
                    <Languages size={14} />
                    <span>Translate All</span>
                  </>
                )}
              </button>

              <button
                className="pdf-btn"
                onClick={handleExportDocument}
                title="Export Translated Document"
              >
                <Download size={14} />
              </button>
            </>
          )}

          <button
            className="pdf-btn pdf-btn-icon"
            onClick={() => chrome.runtime.openOptionsPage()}
            title="Settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* Progress Strip */}
      {isTranslatingDoc && (
        <div className="pdf-progress-strip">
          <div className="pdf-progress-bar" style={{ width: `${docProgress}%` }} />
        </div>
      )}

      {/* Main Content Area */}
      <main className="pdf-main-area">
        {!isLoaded ? (
          <div
            className={`pdf-empty-state ${isDragging ? 'drag-active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file && file.type === 'application/pdf') {
                loadFromFile(file);
              }
            }}
          >
            {errorMsg && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '12px 18px',
                  borderRadius: 10,
                  color: '#fca5a5',
                  maxWidth: 540,
                  marginBottom: 20
                }}
              >
                <AlertCircle size={20} />
                <span style={{ fontSize: '13px', lineHeight: 1.4 }}>{errorMsg}</span>
              </div>
            )}

            <div className="pdf-dropzone" onClick={() => fileInputRef.current?.click()}>
              <div className="pdf-dropzone-icon">
                {isLoading ? <Loader2 size={32} className="animate-spin" /> : <FileText size={32} />}
              </div>
              <div className="pdf-dropzone-title">
                {isLoading ? 'Loading PDF Document...' : 'Open or Drop a PDF File Here'}
              </div>
              <div className="pdf-dropzone-subtitle">
                Select any local or online PDF document to view and translate with Gemini AI. Supports bilingual parallel reading and technical term explanation.
              </div>
              <button className="pdf-btn pdf-btn-primary" style={{ padding: '8px 20px' }}>
                <Upload size={15} />
                <span>Select PDF from Computer</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="pdf-viewer-split">
            {/* Left Column: Original PDF Page Canvas */}
            <section className="pdf-canvas-column">
              <div className="pdf-canvas-wrapper">
                <canvas ref={canvasRef} />
              </div>
            </section>

            {/* Right Column: AI Bilingual Translations */}
            <section className="pdf-translation-column">
              <div className="pdf-translation-header">
                <div className="pdf-translation-title">
                  <Sparkles size={16} />
                  <span>
                    {isPersian ? 'ترجمه هوشمند و یادداشت‌ها' : 'AI Translation & Analysis'}
                  </span>
                </div>

                {currentTranslation && (
                  <button
                    className="pdf-btn"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                    onClick={handleTranslateCurrentPage}
                    title="Retranslate this page"
                  >
                    <RotateCcw size={12} />
                    <span>Retranslate</span>
                  </button>
                )}
              </div>

              {currentParagraphs.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--pdf-text-muted)' }}>
                  No text nodes detected on this page. If this is a scanned image, use region translation.
                </div>
              ) : (
                currentParagraphs.map((originalText, idx) => {
                  const translatedText = currentTranslation?.translatedParagraphs[idx];

                  return (
                    <div key={idx} className="pdf-para-card">
                      <div className="pdf-para-original">{originalText}</div>

                      {translatedText ? (
                        <div className={`pdf-para-translated ${isPersian ? 'rtl' : ''}`}>
                          {translatedText}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--pdf-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          Click &quot;Translate Page&quot; to translate this paragraph with Gemini.
                        </div>
                      )}

                      {translatedText && (
                        <div className="pdf-para-actions">
                          <button
                            className="pdf-btn pdf-btn-icon"
                            style={{ padding: '4px' }}
                            onClick={() => handleCopyText(translatedText, idx)}
                            title="Copy translation"
                          >
                            {copiedIdx === idx ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </main>

      {/* Floating Selection Quick Translate Popover */}
      {selectionPopover && (
        <div
          className="pdf-selection-popover"
          style={{ left: selectionPopover.x, top: selectionPopover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} /> Selection Translation
            </span>
            <button
              onClick={() => setSelectionPopover(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 6, maxHeight: 60, overflowY: 'auto' }}>
            {selectionPopover.text}
          </div>

          {selectionPopover.loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontSize: '12px' }}>
              <Loader2 size={14} className="animate-spin" /> Translating...
            </div>
          ) : (
            <div
              style={{
                fontSize: '13px',
                color: '#f8fafc',
                lineHeight: 1.6,
                direction: isPersian ? 'rtl' : 'ltr',
                textAlign: isPersian ? 'right' : 'left'
              }}
            >
              {selectionPopover.translation}
            </div>
          )}

          {selectionPopover.explanations && selectionPopover.explanations.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #334155' }}>
              {selectionPopover.explanations.map((exp, i) => (
                <div key={i} className="pdf-term-badge" title={exp.meaning}>
                  <strong>{exp.term}:</strong> {exp.meaning}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
