import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Crop,
  X,
  Loader2,
  Languages,
  BookOpen,
  Settings as SettingsIcon,
  AlertCircle
} from 'lucide-react';
import { storageService } from '../services/storage/storage-service';
import { SUPPORTED_LANGUAGES, DEFAULT_SETTINGS } from '../services/storage/defaults';
import { geminiClient } from '../services/gemini/client';
import { ExtensionSettings } from '../types/settings';
import { TranslationResult } from '../types/translation';
import { normalizeRect, NormalizedRect } from '../content/selection/coords';
import {
  createPdfTranslationResult,
  calculatePdfPanelPosition,
  calculateSafeCropBounds,
  formatSnipErrorMessage
} from '../services/pdf/pdf-region';
import { FloatingPanel } from '../content/overlays/FloatingPanel';

interface SnipData {
  image: string;
  title?: string;
  url?: string;
  timestamp: number;
}

export const SnipApp: React.FC = () => {
  const [snipData, setSnipData] = useState<SnipData | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [targetLang, setTargetLang] = useState('fa');
  const [isSelecting, setIsSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<NormalizedRect | null>(null);
  const [persistentRect, setPersistentRect] = useState<NormalizedRect | null>(null);

  // Result state
  const [isLoading, setIsLoading] = useState(false);
  const [activeResults, setActiveResults] = useState<TranslationResult[]>([]);
  const [panelPositions, setPanelPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Load stored screenshot and settings
    chrome.storage.local.get(['antigravity_snip_data'], (res) => {
      if (res.antigravity_snip_data) {
        setSnipData(res.antigravity_snip_data);
      }
    });

    storageService.getSettings().then((s) => {
      setSettings(s);
      if (s.targetLanguage) {
        setTargetLang(s.targetLanguage);
      }
    });

    // Keyboard shortcut handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeResults.length > 0) {
          setActiveResults((prev) => prev.slice(0, -1));
          if (activeResults.length <= 1) setPersistentRect(null);
        } else {
          window.close();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeResults.length]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLoading) return;
    if ((e.target as HTMLElement).closest('.floating-panel') || (e.target as HTMLElement).closest('.snip-hud')) {
      return;
    }
    if (e.button !== 0) return; // Left click only

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;

    setDragStart({ x, y });
    setIsSelecting(true);
    setCurrentRect(normalizeRect(x, y, x, y));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !dragStart) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;

    const norm = normalizeRect(dragStart.x, dragStart.y, x, y);
    setCurrentRect(norm);
  };

  const handlePositionChange = useCallback((id: string, pos: { x: number; y: number }) => {
    setPanelPositions((prev) => {
      const existing = prev.get(id);
      if (existing && Math.abs(existing.x - pos.x) < 2 && Math.abs(existing.y - pos.y) < 2) {
        return prev;
      }
      return new Map(prev).set(id, pos);
    });
  }, []);

  const handleMouseUp = async () => {
    if (!isSelecting || !currentRect) {
      setIsSelecting(false);
      return;
    }

    setIsSelecting(false);

    const img = imageRef.current;
    if (!img) return;

    const cropBounds = calculateSafeCropBounds(
      currentRect,
      {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight
      },
      15
    );

    if (!cropBounds) {
      setCurrentRect(null);
      setDragStart(null);
      return;
    }

    setPersistentRect(currentRect);

    try {
      setIsLoading(true);
      setErrorMsg(null);

      // Crop image onto offscreen canvas
      const offscreen = document.createElement('canvas');
      offscreen.width = cropBounds.cropWidth;
      offscreen.height = cropBounds.cropHeight;
      const ctx = offscreen.getContext('2d');

      if (!ctx) throw new Error('Could not create canvas context');

      ctx.drawImage(
        img,
        cropBounds.cropLeft,
        cropBounds.cropTop,
        cropBounds.cropWidth,
        cropBounds.cropHeight,
        0,
        0,
        cropBounds.cropWidth,
        cropBounds.cropHeight
      );

      const croppedDataUrl = offscreen.toDataURL('image/png');

      // Send to Gemini Vision
      const res = await geminiClient.translateRegionImage(croppedDataUrl, {
        targetLanguage: targetLang
      });

      const effectiveSettings = settings || DEFAULT_SETTINGS;
      const newResult = createPdfTranslationResult(res, {
        sourceTextFallback: targetLang === 'fa' ? '[ناحیه تصویری PDF]' : '[PDF Visual Region]',
        isVisual: true,
        targetLanguageFallback: targetLang
      });

      const initialPos = calculatePdfPanelPosition(
        currentRect,
        effectiveSettings.panelWidth || 420,
        Math.min(effectiveSettings.panelMaxHeight || 520, window.innerHeight - 48),
        window.innerWidth,
        window.innerHeight
      );

      setPanelPositions((prev) => new Map(prev).set(newResult.id, initialPos));
      setActiveResults((prev) => [...prev, newResult]);
      setCurrentRect(null);
    } catch (err: unknown) {
      console.error('Snip translation error:', err);
      const friendlyMsg = formatSnipErrorMessage(err);
      setErrorMsg(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetranslate = async (res: TranslationResult) => {
    try {
      const updated = await geminiClient.translateRegionText(res.sourceText, {
        targetLanguage: res.targetLanguage
      });
      setActiveResults((prev) =>
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
      console.error('Retranslate error:', err);
    }
  };

  const handleOpenInFullViewer = () => {
    if (snipData?.url) {
      chrome.tabs.create({
        url: chrome.runtime.getURL(`pdf-viewer.html?src=${encodeURIComponent(snipData.url)}`)
      });
      window.close();
    }
  };

  if (!snipData) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          color: '#94a3b8',
          gap: 16
        }}
      >
        <Loader2 size={36} className="animate-spin" color="#3b82f6" />
        <span style={{ fontSize: '15px' }}>در حال آماده‌سازی ابزار ترجمه ناحیه PDF...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="snip-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Floating HUD */}
      <div className="snip-hud">
        <div className="snip-hud-title">
          <Crop size={16} />
          <span>ترجمه ناحیه انتخابی PDF</span>
        </div>

        <div className="snip-hud-instruction">
          ناحیه مورد نظر را با ماوس بکشید (Esc برای بستن)
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Languages size={14} color="#94a3b8" />
          <select
            className="pdf-select"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            style={{ padding: '3px 8px', fontSize: '12px' }}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
        </div>

        {snipData.url && (
          <button
            className="snip-hud-btn"
            onClick={handleOpenInFullViewer}
            title="باز کردن سند در نمایشگر اختصاصی PDF"
          >
            <BookOpen size={13} />
            <span>نمایشگر کامل</span>
          </button>
        )}

        <button
          className="snip-hud-btn"
          onClick={() => chrome.runtime.openOptionsPage()}
          title="تنظیمات افزونه و کلیدهای API"
        >
          <SettingsIcon size={13} />
          <span>تنظیمات</span>
        </button>

        <button
          className="snip-hud-btn close"
          onClick={() => window.close()}
          title="بستن (Esc)"
        >
          <X size={14} />
          <span>بستن</span>
        </button>
      </div>

      {/* Captured Image and Selection Box */}
      <div className="snip-image-wrapper">
        <img
          ref={imageRef}
          src={snipData.image}
          alt="PDF Screenshot"
          draggable={false}
        />

        {/* Selection Rectangle while dragging */}
        {currentRect && isSelecting && (
          <div
            className="snip-selection-box"
            style={{
              left: `${currentRect.left}px`,
              top: `${currentRect.top}px`,
              width: `${currentRect.width}px`,
              height: `${currentRect.height}px`
            }}
          >
            <div className="snip-size-badge">
              {Math.round(currentRect.width)} × {Math.round(currentRect.height)}
            </div>
          </div>
        )}

        {/* Persistent Selection Rectangle */}
        {persistentRect && (
          <div
            className="persistent-selection-box"
            style={{
              left: `${persistentRect.left}px`,
              top: `${persistentRect.top}px`,
              width: `${persistentRect.width}px`,
              height: `${persistentRect.height}px`
            }}
          />
        )}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'fixed',
            top: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(12px)',
            padding: '10px 20px',
            borderRadius: '24px',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 2000
          }}
        >
          <Loader2 size={18} className="animate-spin" color="#60a5fa" />
          <span style={{ fontSize: '13px', color: '#f8fafc', fontWeight: 500 }}>
            در حال ترجمه با Gemini...
          </span>
        </div>
      )}

      {/* Error notification banner */}
      {errorMsg && (
        <div
          style={{
            position: 'fixed',
            top: '72px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(185, 28, 28, 0.95)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '24px',
            fontSize: '13px',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            maxWidth: '90vw'
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
          {(errorMsg.includes('تنظیمات') || errorMsg.includes('کلید API')) && (
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              style={{
                background: '#fff',
                color: '#b91c1c',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                marginRight: '6px'
              }}
            >
              باز کردن تنظیمات
            </button>
          )}
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px'
            }}
            title="بستن پیام"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Floating Result Panels (identical to website mode) */}
      {activeResults.map((result) => {
        const effectiveSettings = settings || DEFAULT_SETTINGS;
        const initialPos = panelPositions.get(result.id) || { x: 50, y: 50 };

        return (
          <FloatingPanel
            key={result.id}
            result={result}
            settings={effectiveSettings}
            initialPosition={initialPos}
            onClose={(id) => {
              setActiveResults((prev) => prev.filter((r) => r.id !== id));
              if (activeResults.length <= 1) setPersistentRect(null);
            }}
            onPositionChange={(pos) => handlePositionChange(result.id, pos)}
            onRetranslate={handleRetranslate}
          />
        );
      })}
    </div>
  );
};
