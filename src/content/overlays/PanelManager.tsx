import React, { useCallback } from 'react';
import { TranslationResult } from '../../types/translation';
import { ExtensionSettings, PanelPosition } from '../../types/settings';
import { FloatingPanel } from './FloatingPanel';
import { storageService } from '../../services/storage/storage-service';
import { geminiClient } from '../../services/gemini/client';

interface PanelManagerProps {
  settings: ExtensionSettings;
  results: TranslationResult[];
  onRemoveResult: (id: string) => void;
  onUpdateResult: (result: TranslationResult) => void;
}

export function calculateDefaultPosition(
  positionPreset: PanelPosition,
  panelWidth: number,
  panelHeight: number,
  lastSavedPos: { x: number; y: number } | null,
  index = 0
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 24;
  const minMargin = 16;
  const offset = index * 24;

  if (positionPreset === 'remember' && lastSavedPos) {
    return {
      x: Math.max(minMargin, Math.min(vw - panelWidth - minMargin, lastSavedPos.x + offset)),
      y: Math.max(minMargin, Math.min(vh - panelHeight - minMargin, lastSavedPos.y + offset))
    };
  }

  let x = vw - panelWidth - pad;
  let y = vh - panelHeight - pad;

  switch (positionPreset) {
    case 'top-left':
      x = pad;
      y = pad;
      break;
    case 'top-center':
      x = (vw - panelWidth) / 2;
      y = pad;
      break;
    case 'top-right':
      x = vw - panelWidth - pad;
      y = pad;
      break;
    case 'center-left':
      x = pad;
      y = (vh - panelHeight) / 2;
      break;
    case 'center':
      x = (vw - panelWidth) / 2;
      y = (vh - panelHeight) / 2;
      break;
    case 'center-right':
      x = vw - panelWidth - pad;
      y = (vh - panelHeight) / 2;
      break;
    case 'bottom-left':
      x = pad;
      y = vh - panelHeight - pad;
      break;
    case 'bottom-center':
      x = (vw - panelWidth) / 2;
      y = vh - panelHeight - pad;
      break;
    case 'bottom-right':
    default:
      x = vw - panelWidth - pad;
      y = vh - panelHeight - pad;
      break;
  }

  return {
    x: Math.max(minMargin, Math.min(vw - panelWidth - minMargin, x + offset)),
    y: Math.max(minMargin, Math.min(vh - panelHeight - minMargin, y + offset))
  };
}

export const PanelManager: React.FC<PanelManagerProps> = ({
  settings,
  results,
  onRemoveResult,
  onUpdateResult
}) => {
  const handlePositionChange = useCallback(
    (pos: { x: number; y: number }) => {
      if (settings.rememberPosition) {
        storageService.saveSettings({ lastSavedPosition: pos });
      }
    },
    [settings.rememberPosition]
  );

  const handleRetranslate = async (res: TranslationResult) => {
    try {
      const updated = await geminiClient.translateRegionText(res.sourceText, {
        targetLanguage: res.targetLanguage
      });
      onUpdateResult({
        ...res,
        translatedText: updated.translation,
        explanations: updated.explanations || [],
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('Failed to retranslate result:', err);
    }
  };

  return (
    <div className="panels-container">
      {results.map((result, idx) => {
        const estimatedHeight = Math.min(settings.panelMaxHeight || 520, window.innerHeight - 48);
        const initialPos = calculateDefaultPosition(
          settings.panelPosition,
          settings.panelWidth,
          estimatedHeight,
          settings.lastSavedPosition,
          idx
        );

        return (
          <FloatingPanel
            key={result.id}
            result={result}
            settings={settings}
            initialPosition={initialPos}
            onClose={onRemoveResult}
            onPositionChange={handlePositionChange}
            onRetranslate={handleRetranslate}
          />
        );
      })}
    </div>
  );
};
