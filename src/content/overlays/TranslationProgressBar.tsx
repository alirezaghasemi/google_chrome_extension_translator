import React from 'react';
import { PageTranslationProgress } from '../../types/translation';
import { ExtensionSettings } from '../../types/settings';
import { getI18n, isRtl } from '../../i18n/i18n';
import { Loader2, Pause, Play, X, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';

interface TranslationProgressBarProps {
  progress: PageTranslationProgress;
  settings: ExtensionSettings;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRestore: () => void;
}

export const TranslationProgressBar: React.FC<TranslationProgressBarProps> = ({
  progress,
  settings,
  onPause,
  onResume,
  onCancel,
  onRestore
}) => {
  if (progress.status === 'idle') {
    return null;
  }

  const t = getI18n(settings.uiLanguage);
  const rtl = isRtl(settings.uiLanguage);

  return (
    <div className={`translation-progress-pill ${rtl ? 'rtl' : ''}`}>
      {/* Status Icon */}
      {progress.status === 'translating' && <Loader2 size={16} className="animate-spin" color="#38bdf8" />}
      {progress.status === 'paused' && <Pause size={16} color="#facc15" />}
      {progress.status === 'completed' && <CheckCircle2 size={16} color="#4ade80" />}
      {progress.status === 'error' && <AlertCircle size={16} color="#f87171" />}

      {/* Label and Chunk count */}
      <span style={{ fontWeight: 500 }}>
        {progress.status === 'translating' && `${t.status.translating} (${progress.completedChunks}/${progress.totalChunks})`}
        {progress.status === 'paused' && `${t.actions.pause} (${progress.percentage}%)`}
        {progress.status === 'completed' && t.status.pageTranslated}
        {progress.status === 'restoring' && 'Restoring original text...'}
        {progress.status === 'error' && (progress.errorMessage || 'Translation failed')}
      </span>

      {/* Progress track */}
      {(progress.status === 'translating' || progress.status === 'paused') && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress.percentage}%` }} />
        </div>
      )}

      {/* Controls */}
      {progress.status === 'translating' && (
        <button className="pill-btn" onClick={onPause} title={t.actions.pause}>
          <Pause size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
          {t.actions.pause}
        </button>
      )}

      {progress.status === 'paused' && (
        <button className="pill-btn" onClick={onResume} title={t.actions.resume}>
          <Play size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
          {t.actions.resume}
        </button>
      )}

      {progress.status === 'completed' && (
        <button className="pill-btn" onClick={onRestore} title={t.actions.restoreOriginal}>
          <RotateCcw size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
          {t.actions.restoreOriginal}
        </button>
      )}

      <button className="pill-btn danger" onClick={onCancel} title={t.actions.cancel}>
        <X size={12} />
      </button>
    </div>
  );
};
