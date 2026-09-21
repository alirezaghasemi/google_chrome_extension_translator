import React, { useState, useRef, useEffect } from 'react';
import { TranslationResult } from '../../types/translation';
import { ExtensionSettings } from '../../types/settings';
import { getI18n, isRtl } from '../../i18n/i18n';
import {
  Copy,
  Check,
  RotateCw,
  X,
  Minus,
  Maximize2,
  BookOpen,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';

interface FloatingPanelProps {
  result: TranslationResult;
  settings: ExtensionSettings;
  initialPosition: { x: number; y: number };
  onClose: (id: string) => void;
  onPositionChange: (pos: { x: number; y: number }) => void;
  onRetranslate: (result: TranslationResult) => void;
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  result,
  settings,
  initialPosition,
  onClose,
  onPositionChange,
  onRetranslate
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [showExplanations, setShowExplanations] = useState(true);
  const [opacity, setOpacity] = useState(settings.panelOpacity);
  const [copied, setCopied] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const t = getI18n(settings.uiLanguage);
  const rtl = isRtl(result.targetLanguage || settings.targetLanguage);

  const clampPosition = (x: number, y: number): { x: number; y: number } => {
    const el = panelRef.current;
    const width = el?.offsetWidth || (isMinimized ? 320 : settings.panelWidth);
    const height = el?.offsetHeight || 300;
    const pad = 16;
    const maxX = Math.max(pad, window.innerWidth - width - pad);
    const maxY = Math.max(pad, window.innerHeight - height - pad);
    return {
      x: Math.max(pad, Math.min(maxX, x)),
      y: Math.max(pad, Math.min(maxY, y))
    };
  };

  // Keep panel safely within viewport bounds whenever content or window size changes
  useEffect(() => {
    if (isDragging) return;
    const el = panelRef.current;
    if (!el) return;

    const adjustPosition = () => {
      if (isDragging) return;
      const rect = el.getBoundingClientRect();
      const pad = 16;
      let needsUpdate = false;
      let nextX = position.x;
      let nextY = position.y;

      // Check bottom overflow
      if (rect.bottom > window.innerHeight - pad) {
        nextY = Math.max(pad, window.innerHeight - rect.height - pad);
        needsUpdate = true;
      }
      // Check top overflow
      if (nextY < pad) {
        nextY = pad;
        needsUpdate = true;
      }
      // Check right overflow
      if (rect.right > window.innerWidth - pad) {
        nextX = Math.max(pad, window.innerWidth - rect.width - pad);
        needsUpdate = true;
      }
      // Check left overflow
      if (nextX < pad) {
        nextX = pad;
        needsUpdate = true;
      }

      if (needsUpdate) {
        const adjusted = { x: nextX, y: nextY };
        setPosition(adjusted);
        onPositionChange(adjusted);
      }
    };

    adjustPosition();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        adjustPosition();
      });
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', adjustPosition);
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', adjustPosition);
    };
  }, [isDragging, showExplanations, isMinimized, result.translatedText, result.explanations, onPositionChange]);

  // Drag listeners
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rawX = e.clientX - dragOffset.x;
      const rawY = e.clientY - dragOffset.y;
      const newPos = clampPosition(rawX, rawY);
      setPosition(newPos);
      onPositionChange(newPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, onPositionChange]);

  const startDrag = (e: React.MouseEvent) => {
    if (!settings.enableDragging || (e.target as HTMLElement).closest('.header-actions')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const isDarkMode =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const safeMaxHeight = Math.min(settings.panelMaxHeight || 520, window.innerHeight - 32);

  return (
    <div
      ref={panelRef}
      className={`floating-panel ${isDarkMode ? 'dark' : ''} ${rtl ? 'rtl' : ''} ${
        isMinimized ? 'minimized' : ''
      }`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? '320px' : `${settings.panelWidth}px`,
        maxHeight: `${safeMaxHeight}px`,
        opacity: opacity
      }}
    >
      {/* Header */}
      <div className="panel-header" onMouseDown={startDrag}>
        <div className="header-title-group">
          <Sparkles size={16} color="#2563eb" />
          <span>{t.panel.title}</span>
          {result.isVisual && (
            <span className="header-badge" title="Image / Vision Translation">
              <ImageIcon size={10} style={{ display: 'inline', marginInlineEnd: 4 }} />
              Vision
            </span>
          )}
        </div>

        <div className="header-actions">
          {result.explanations && result.explanations.length > 0 && (
            <button
              className={`icon-btn ${showExplanations ? 'active' : ''}`}
              title={t.panel.explanations}
              onClick={() => setShowExplanations(!showExplanations)}
            >
              <BookOpen size={14} />
            </button>
          )}

          <button
            className="icon-btn"
            title={copied ? t.actions.copied : t.actions.copy}
            onClick={handleCopy}
          >
            {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
          </button>

          <button
            className="icon-btn"
            title={t.actions.retranslate}
            onClick={() => onRetranslate(result)}
          >
            <RotateCw size={14} />
          </button>

          <button
            className="icon-btn"
            title={isMinimized ? t.actions.settings : t.actions.close}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minus size={14} />}
          </button>

          <button
            className="icon-btn"
            title={t.actions.close}
            onClick={() => onClose(result.id)}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body (hidden if minimized) */}
      {!isMinimized && (
        <div className="panel-body">
          {/* Source Text Snippet */}
          <div>
            <div className="section-label">{t.panel.source}</div>
            <div className="source-box">
              {result.sourceText || (settings.uiLanguage === 'fa' ? 'متن منبع یافت نشد' : 'No source text detected')}
            </div>
          </div>

          {/* Translated Text */}
          <div>
            <div className="section-label">{t.panel.translation}</div>
            <div className="translation-box">{result.translatedText}</div>
          </div>

          {/* Contextual Technical Explanations */}
          {showExplanations && result.explanations && result.explanations.length > 0 && (
            <div className="explanations-section">
              <div className="section-label">{t.panel.explanations}</div>
              {result.explanations.map((exp, idx) => (
                <div key={idx} className="explanation-card">
                  <div className="term-title">{exp.term}</div>
                  <div className="term-meaning">{exp.meaning}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!isMinimized && (
        <div className="panel-footer">
          <div className="opacity-slider-wrap">
            <span>{t.panel.opacity}</span>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="opacity-slider"
            />
            <span>{Math.round(opacity * 100)}%</span>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b' }}>
            {result.sourceLanguage?.toUpperCase()} → {result.targetLanguage?.toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
};
