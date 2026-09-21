import React, { useState, useEffect } from 'react';
import { ScreenshotResult } from '../../types/screenshot';
import { ExtensionSettings } from '../../types/settings';
import { getI18n, isRtl } from '../../i18n/i18n';
import { Download, Copy, Check, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ScreenshotPreviewModalProps {
  screenshot: ScreenshotResult | null;
  settings: ExtensionSettings;
  onClose: () => void;
}

export const ScreenshotPreviewModal: React.FC<ScreenshotPreviewModalProps> = ({
  screenshot,
  settings,
  onClose
}) => {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!screenshot) return null;

  const t = getI18n(settings.uiLanguage);
  const rtl = isRtl(settings.uiLanguage);

  const handleDownload = () => {
    const link = document.createElement('a');
    const ext = screenshot.format === 'jpeg' ? 'jpg' : 'png';
    link.download = `screenshot_${Date.now()}.${ext}`;
    link.href = screenshot.dataUrl;
    link.click();
  };

  const handleCopyImage = async () => {
    try {
      const res = await fetch(screenshot.dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-card ${rtl ? 'rtl' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title">
            Screenshot Preview ({screenshot.width} × {screenshot.height} px)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="icon-btn"
              title="Zoom In"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            >
              <ZoomIn size={16} color="#94a3b8" />
            </button>
            <button
              className="icon-btn"
              title="Zoom Out"
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              <ZoomOut size={16} color="#94a3b8" />
            </button>
            <button
              className="icon-btn"
              title="Reset Zoom"
              onClick={() => setZoom(1)}
            >
              <RotateCcw size={16} color="#94a3b8" />
            </button>
            <button className="icon-btn" title={t.actions.close} onClick={onClose}>
              <X size={18} color="#94a3b8" />
            </button>
          </div>
        </div>

        {/* Modal Viewport */}
        <div className="modal-image-wrap">
          <img
            src={screenshot.dataUrl}
            alt="Screenshot Preview"
            className="modal-image"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          />
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button className="secondary-btn" onClick={handleCopyImage}>
            {copied ? <Check size={16} color="#4ade80" /> : <Copy size={16} />}
            <span>{copied ? t.actions.copied : t.actions.copyImage}</span>
          </button>

          <button className="primary-btn" onClick={handleDownload}>
            <Download size={16} />
            <span>{t.actions.download}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
