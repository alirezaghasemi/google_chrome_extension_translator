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
  AlertCircle,
  Crop
} from 'lucide-react';
import { PdfLoader } from '../services/pdf/pdf-loader';
import { pdfDocumentTranslator, PageTranslationResult } from '../services/pdf/pdf-translator-service';
import { getPdfFileName } from '../services/pdf/pdf-utils';
import { storageService } from '../services/storage/storage-service';
import { SUPPORTED_LANGUAGES, DEFAULT_SETTINGS } from '../services/storage/defaults';
import { ExtensionSettings } from '../types/settings';
import { TranslationResult } from '../types/translation';
import { TermExplanation } from '../types/gemini';
import { geminiClient } from '../services/gemini/client';
import { normalizeRect, NormalizedRect } from '../content/selection/coords';
import {
  cropCanvasRegion,
  isMeaningfulPdfSelection,
  createPdfTranslationResult,
  calculatePdfPanelPosition,
  mapDisplayRectToCanvasBitmap,
  formatParagraphErrorMessage
} from '../services/pdf/pdf-region';
import { FloatingPanel } from '../content/overlays/FloatingPanel';

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
  const isPersian = targetLang === 'fa';
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

  // Per-paragraph translating indicator & error state
  const [translatingParaIdx, setTranslatingParaIdx] = useState<number | null>(null);
  const [paraError, setParaError] = useState<{ idx: number; message: string } | null>(null);

  // Floating selection popover for highlighted text
  const [selectionPopover, setSelectionPopover] = useState<{
    text: string;
    translation?: string;
    explanations?: TermExplanation[];
    x: number;
    y: number;
    loading: boolean;
  } | null>(null);

  // Region Selection State
  const [isRegionSelecting, setIsRegionSelecting] = useState(false);
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [currentRegionRect, setCurrentRegionRect] = useState<NormalizedRect | null>(null);
  const [persistentRegionRect, setPersistentRegionRect] = useState<NormalizedRect | null>(null);
  const [regionTranslating, setRegionTranslating] = useState(false);

  // Floating Panels State (matching website mode)
  const [activePanels, setActivePanels] = useState<TranslationResult[]>([]);
  const [panelPositions, setPanelPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const currentRectRef = useRef<NormalizedRect | null>(null);

  // Load initial settings and register region selection listener
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

    // Keyboard shortcut handler for Escape (dismiss selection popover or cancel region selection)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectionPopover) {
          setSelectionPopover(null);
          return;
        }
        if (activePanels.length > 0) {
          setActivePanels((prev) => prev.slice(0, -1));
          if (activePanels.length <= 1) setPersistentRegionRect(null);
        } else {
          setIsRegionSelecting(false);
          setIsDraggingRegion(false);
          setCurrentRegionRect(null);
        }
        return;
      }
    };

    const handleRuntimeMessage = (message: { type?: string }, _sender: unknown, sendResponse: (res: unknown) => void) => {
      if (message.type === 'START_REGION_SELECTION') {
        setIsRegionSelecting(true);
        sendResponse({ success: true });
        return true;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

    return () => {
      loader.destroy();
      window.removeEventListener('keydown', handleKeyDown);
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, []);

  // Render canvas & load page paragraphs on page or zoom change
  useEffect(() => {
    if (!isLoaded || !canvasRef.current || currentPage < 1) return;

    // Clear stale selections and drag state on page or zoom level changes
    setPersistentRegionRect(null);
    setCurrentRegionRect(null);
    setIsDraggingRegion(false);
    setIsRegionSelecting(false);
    dragStartRef.current = null;
    currentRectRef.current = null;

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

  // Region Selection mouse handlers on PDF Canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!isRegionSelecting || regionTranslating || !canvasRef.current) return;
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvasRect.width, e.clientX - canvasRect.left));
    const y = Math.max(0, Math.min(canvasRect.height, e.clientY - canvasRect.top));

    const initialRect = normalizeRect(x, y, x, y);
    dragStartRef.current = { x, y };
    currentRectRef.current = initialRect;
    setCurrentRegionRect(initialRect);
    setIsDraggingRegion(true);
  };

  useEffect(() => {
    if (!isDraggingRegion) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current || !dragStartRef.current) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const currentX = Math.max(0, Math.min(canvasRect.width, e.clientX - canvasRect.left));
      const currentY = Math.max(0, Math.min(canvasRect.height, e.clientY - canvasRect.top));

      const rect = normalizeRect(dragStartRef.current.x, dragStartRef.current.y, currentX, currentY);
      currentRectRef.current = rect;
      setCurrentRegionRect(rect);
    };

    const handleWindowMouseUp = async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDraggingRegion(false);
      const selRect = currentRectRef.current;
      const canvas = canvasRef.current;

      if (!canvas || !selRect || !isMeaningfulPdfSelection(selRect, 10)) {
        setCurrentRegionRect(null);
        dragStartRef.current = null;
        currentRectRef.current = null;
        return;
      }

      const canvasRect = canvas.getBoundingClientRect();
      const bitmapRect = mapDisplayRectToCanvasBitmap(
        selRect,
        { width: canvasRect.width, height: canvasRect.height },
        canvas.width,
        canvas.height
      );

      const cropped = cropCanvasRegion(canvas, bitmapRect);
      if (!cropped) {
        setCurrentRegionRect(null);
        dragStartRef.current = null;
        currentRectRef.current = null;
        return;
      }

      try {
        setRegionTranslating(true);
        setIsRegionSelecting(false);
        setPersistentRegionRect(selRect);
        setCurrentRegionRect(null);
        dragStartRef.current = null;
        currentRectRef.current = null;

        const res = await geminiClient.translateRegionImage(cropped, {
          targetLanguage: targetLang
        });

        const effectiveSettings = settings || DEFAULT_SETTINGS;
        const newResult = createPdfTranslationResult(res, {
          sourceTextFallback: isPersian ? '[ناحیه تصویری PDF]' : '[PDF Visual Region]',
          isVisual: true,
          targetLanguageFallback: targetLang
        });

        const initialPos = calculatePdfPanelPosition(
          {
            left: selRect.left + canvasRect.left,
            top: selRect.top + canvasRect.top,
            width: selRect.width,
            height: selRect.height,
            right: selRect.right + canvasRect.left,
            bottom: selRect.bottom + canvasRect.top
          },
          effectiveSettings.panelWidth || 420,
          Math.min(effectiveSettings.panelMaxHeight || 520, window.innerHeight - 48),
          window.innerWidth,
          window.innerHeight
        );

        setPanelPositions((prev) => new Map(prev).set(newResult.id, initialPos));
        setActivePanels((prev) => [...prev, newResult]);
      } catch (err: unknown) {
        const error = err as Error;
        alert(`خطا در ترجمه ناحیه: ${error.message}`);
      } finally {
        setRegionTranslating(false);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDraggingRegion, targetLang, settings, isPersian]);

  const handleRetranslatePanel = async (res: TranslationResult) => {
    try {
      const updated = await geminiClient.translateRegionText(res.sourceText, {
        targetLanguage: res.targetLanguage
      });
      setActivePanels((prev) =>
        prev.map((r) =>
          r.id === res.id
            ? {
              ...r,
              translatedText: updated.translation,
              explanations: updated.explanations || [],
              timestamp: Date.now()
            }
            : r
        )
      );
    } catch (err) {
      console.error('Retranslate panel error:', err);
    }
  };

  // Translate a single selected paragraph individually
  const handleTranslateSingleParagraph = async (idx: number, text: string) => {
    if (translatingParaIdx !== null || isTranslatingPage || isTranslatingDoc) return;
    setTranslatingParaIdx(idx);
    setParaError(null);

    try {
      const translatedText = await geminiClient.translateParagraph(text, {
        targetLanguage: targetLang,
        style: settings?.translationStyle,
        timeoutMs: Math.max(settings?.requestTimeout || 60000, 60000)
      });
      const updated = pdfDocumentTranslator.setParagraphTranslation(
        currentPage,
        idx,
        currentParagraphs,
        translatedText,
        targetLang
      );
      setCurrentTranslation(updated);
    } catch (err: unknown) {
      const friendlyMsg = formatParagraphErrorMessage(err);
      setParaError({ idx, message: friendlyMsg });
      alert(`خطا در ترجمه پاراگراف:\n${friendlyMsg}`);
    } finally {
      setTranslatingParaIdx(null);
    }
  };

  // Handle text selection in translated column or canvas
  const handleMouseUp = async (e: React.MouseEvent) => {
    if (isRegionSelecting || isDraggingRegion) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 2 && text.length < 1500) {
      const rect = sel?.getRangeAt(0).getBoundingClientRect();
      const x = rect ? rect.left + window.scrollX : e.clientX;
      const y = rect ? rect.bottom + window.scrollY + 8 : e.clientY + 8;

      setSelectionPopover({
        text,
        x: Math.max(16, Math.min(x, window.innerWidth - 400)),
        y: Math.max(16, y),
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
                className="pdf-btn"
                style={
                  isRegionSelecting
                    ? {
                      background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                      borderColor: '#60a5fa',
                      color: '#ffffff',
                      boxShadow: '0 0 12px rgba(59, 130, 246, 0.5)'
                    }
                    : {}
                }
                onClick={() => {
                  setIsRegionSelecting((prev) => !prev);
                  setPersistentRegionRect(null);
                }}
                disabled={isTranslatingPage || isTranslatingDoc || regionTranslating}
                title="Select region on PDF page to translate (Shift+2)"
              >
                {regionTranslating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Crop size={14} />
                    <span>Select Region</span>
                    <span
                      style={{
                        fontSize: '10px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontWeight: 600
                      }}
                    >
                      Shift+2
                    </span>
                  </>
                )}
              </button>

              <button
                className="pdf-btn pdf-btn-primary"
                onClick={handleTranslateCurrentPage}
                disabled={isTranslatingPage || isTranslatingDoc || isRegionSelecting}
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
              {isRegionSelecting && (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 40,
                    marginBottom: 12,
                    background: 'rgba(37, 99, 235, 0.9)',
                    backdropFilter: 'blur(8px)',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontSize: '13px',
                    fontWeight: 500,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <Crop size={16} />
                  <span>
                    {isPersian
                      ? 'با ماوس کادری دور متن یا ناحیه مورد نظر بکشید (کلید Esc برای لغو)'
                      : 'Drag a box around any text or image area to translate (Esc to cancel)'}
                  </span>
                </div>
              )}

              <div
                className={`pdf-canvas-wrapper ${isRegionSelecting ? 'selecting' : ''}`}
                ref={canvasWrapperRef}
                style={{
                  cursor: isRegionSelecting ? 'crosshair' : 'default',
                  position: 'relative',
                  userSelect: isRegionSelecting ? 'none' : 'auto'
                }}
                onMouseDown={handleCanvasMouseDown}
              >
                <canvas ref={canvasRef} />

                {/* Selection crop box */}
                {isRegionSelecting && isDraggingRegion && currentRegionRect && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${currentRegionRect.left}px`,
                      top: `${currentRegionRect.top}px`,
                      width: `${currentRegionRect.width}px`,
                      height: `${currentRegionRect.height}px`,
                      border: '2px solid #3b82f6',
                      background: 'rgba(59, 130, 246, 0.15)',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                      pointerEvents: 'none',
                      zIndex: 30
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '-22px',
                        right: 0,
                        background: '#1e293b',
                        color: '#93c5fd',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        padding: '1px 5px',
                        fontSize: '10px',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {Math.round(currentRegionRect.width)} × {Math.round(currentRegionRect.height)}
                    </div>
                  </div>
                )}

                {/* Persistent selection box */}
                {persistentRegionRect && (
                  <div
                    className="persistent-selection-box"
                    style={{
                      position: 'absolute',
                      left: `${persistentRegionRect.left}px`,
                      top: `${persistentRegionRect.top}px`,
                      width: `${persistentRegionRect.width}px`,
                      height: `${persistentRegionRect.height}px`,
                      pointerEvents: 'none',
                      zIndex: 25
                    }}
                  />
                )}
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
                  const isParaTranslating = translatingParaIdx === idx;

                  return (
                    <div key={idx} className="pdf-para-card">
                      <div className="pdf-para-original">{originalText}</div>

                      {translatedText ? (
                        <div className={`pdf-para-translated ${isPersian ? 'rtl' : ''}`}>
                          {translatedText}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--pdf-text-muted)', fontSize: '13px', fontStyle: 'italic', marginTop: '4px' }}>
                          {isPersian
                            ? 'برای ترجمه این بخش، دکمه «ترجمه این پاراگراف» را بزنید یا متن را با ماوس انتخاب کنید.'
                            : 'Click "Translate Paragraph" below or select any text to translate.'}
                        </div>
                      )}

                      {paraError?.idx === idx && (
                        <div
                          style={{
                            color: '#f87171',
                            fontSize: '12px',
                            marginTop: '6px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <AlertCircle size={14} style={{ flexShrink: 0 }} />
                          <span>{paraError.message}</span>
                        </div>
                      )}

                      <div className="pdf-para-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                        <button
                          className="pdf-btn"
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            background: translatedText ? 'rgba(255, 255, 255, 0.06)' : 'rgba(99, 102, 241, 0.15)',
                            borderColor: translatedText ? 'var(--pdf-border)' : 'rgba(99, 102, 241, 0.4)',
                            color: translatedText ? 'var(--pdf-text-muted)' : '#a5b4fc',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          disabled={isParaTranslating || isTranslatingPage || isTranslatingDoc}
                          onClick={() => handleTranslateSingleParagraph(idx, originalText)}
                          title={translatedText ? (isPersian ? 'ترجمه مجدد این پاراگراف' : 'Retranslate paragraph') : (isPersian ? 'ترجمه این پاراگراف با هوش مصنوعی' : 'Translate this paragraph')}
                        >
                          {isParaTranslating ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              <span>{isPersian ? 'در حال ترجمه...' : 'Translating...'}</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              <span>{translatedText ? (isPersian ? 'ترجمه مجدد' : 'Retranslate') : (isPersian ? 'ترجمه این پاراگراف' : 'Translate Paragraph')}</span>
                            </>
                          )}
                        </button>

                        {translatedText && (
                          <button
                            className="pdf-btn pdf-btn-icon"
                            style={{ padding: '4px' }}
                            onClick={() => handleCopyText(translatedText, idx)}
                            title={isPersian ? 'کپی ترجمه' : 'Copy translation'}
                          >
                            {copiedIdx === idx ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        )}
      </main>

      {/* Floating Panels (matching website mode) */}
      {activePanels.map((result) => {
        const effectiveSettings = settings || DEFAULT_SETTINGS;
        const initialPos = panelPositions.get(result.id) || { x: 50, y: 50 };

        return (
          <FloatingPanel
            key={result.id}
            result={result}
            settings={effectiveSettings}
            initialPosition={initialPos}
            onClose={(id) => {
              setActivePanels((prev) => prev.filter((r) => r.id !== id));
              if (activePanels.length <= 1) setPersistentRegionRect(null);
            }}
            onPositionChange={(pos) => {
              setPanelPositions((prev) => new Map(prev).set(result.id, pos));
            }}
            onRetranslate={handleRetranslatePanel}
          />
        );
      })}

      {/* Floating Selection Quick Translate Popover */}
      {selectionPopover && (
        <div
          className="pdf-selection-popover"
          style={{ left: selectionPopover.x, top: selectionPopover.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} /> {isPersian ? 'ترجمه هوشمند متن انتخابی' : 'Selection Translation'}
            </span>
            <button
              onClick={() => setSelectionPopover(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 6, maxHeight: 60, overflowY: 'auto' }}>
            {selectionPopover.text}
          </div>

          {selectionPopover.loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#60a5fa', fontSize: '12px' }}>
              <Loader2 size={14} className="animate-spin" /> {isPersian ? 'در حال ترجمه...' : 'Translating...'}
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
