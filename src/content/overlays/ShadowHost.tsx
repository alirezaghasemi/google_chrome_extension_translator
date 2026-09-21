import React, { useState, useEffect } from 'react';
import { TranslationResult, PageTranslationProgress } from '../../types/translation';
import { ScreenshotResult } from '../../types/screenshot';
import { ExtensionSettings } from '../../types/settings';
import { storageService } from '../../services/storage/storage-service';
import { PanelManager } from './PanelManager';
import { TranslationProgressBar } from './TranslationProgressBar';
import { ScreenshotPreviewModal } from './ScreenshotPreviewModal';
import { pageTranslator } from '../translation/page-translator';
import { regionSelector } from '../selection/region-selector';

export interface ShadowAppHandle {
  addTranslationResult: (result: TranslationResult) => void;
  showScreenshotPreview: (screenshot: ScreenshotResult) => void;
}

interface ShadowAppProps {
  onMountReady?: (handle: ShadowAppHandle) => void;
}

export const ShadowApp: React.FC<ShadowAppProps> = ({ onMountReady }) => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [translationProgress, setTranslationProgress] = useState<PageTranslationProgress>({
    status: 'idle',
    totalChunks: 0,
    completedChunks: 0,
    percentage: 0
  });
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotResult | null>(null);

  useEffect(() => {
    storageService.getSettings().then(setSettings);
    const unsubSettings = storageService.onSettingsChanged(setSettings);
    const unsubProgress = pageTranslator.onProgress(setTranslationProgress);

    if (onMountReady) {
      onMountReady({
        addTranslationResult: (newResult: TranslationResult) => {
          setResults((prev) => [newResult, ...prev]);
        },
        showScreenshotPreview: (ss: ScreenshotResult) => {
          setScreenshotPreview(ss);
        }
      });
    }

    return () => {
      unsubSettings();
      unsubProgress();
    };
  }, [onMountReady]);

  if (!settings) return null;

  const handleRemoveResult = (id: string) => {
    setResults((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (next.length === 0) {
        regionSelector.clearPersistentBox();
      }
      return next;
    });
  };

  const handleUpdateResult = (updated: TranslationResult) => {
    setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  return (
    <>
      <PanelManager
        settings={settings}
        results={results}
        onRemoveResult={handleRemoveResult}
        onUpdateResult={handleUpdateResult}
      />

      <TranslationProgressBar
        progress={translationProgress}
        settings={settings}
        onPause={() => pageTranslator.pause()}
        onResume={() => pageTranslator.resume()}
        onCancel={() => pageTranslator.cancel()}
        onRestore={() => pageTranslator.restoreOriginal()}
      />

      <ScreenshotPreviewModal
        screenshot={screenshotPreview}
        settings={settings}
        onClose={() => setScreenshotPreview(null)}
      />
    </>
  );
};
