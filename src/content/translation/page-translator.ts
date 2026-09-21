import { extractPageTextNodes } from '../dom/text-extractor';
import { textReplacer } from '../dom/text-replacer';
import { createTranslationBatches } from '../../services/translation/chunker';
import { translationCache } from '../../services/translation/cache';
import { geminiClient } from '../../services/gemini/client';
import { storageService } from '../../services/storage/storage-service';
import { PageTranslationProgress, TranslationChunk } from '../../types/translation';

export type ProgressCallback = (progress: PageTranslationProgress) => void;

export class PageTranslator {
  private static instance: PageTranslator;

  private isTranslating = false;
  private isPaused = false;
  private isCancelled = false;

  private progressListeners: ProgressCallback[] = [];
  private currentProgress: PageTranslationProgress = {
    status: 'idle',
    totalChunks: 0,
    completedChunks: 0,
    percentage: 0
  };

  public static getInstance(): PageTranslator {
    if (!PageTranslator.instance) {
      PageTranslator.instance = new PageTranslator();
    }
    return PageTranslator.instance;
  }

  public onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.push(callback);
    callback(this.currentProgress);
    return () => {
      this.progressListeners = this.progressListeners.filter((cb) => cb !== callback);
    };
  }

  private updateProgress(updates: Partial<PageTranslationProgress>): void {
    this.currentProgress = { ...this.currentProgress, ...updates };
    for (const listener of this.progressListeners) {
      try {
        listener(this.currentProgress);
      } catch (err) {
        console.error('Progress listener error:', err);
      }
    }
  }

  public getProgress(): PageTranslationProgress {
    return { ...this.currentProgress };
  }

  public isPageTranslated(): boolean {
    return textReplacer.isPageTranslated();
  }

  /**
   * Starts translating the full document.
   */
  public async start(targetLang?: string): Promise<void> {
    if (this.isTranslating) return;

    this.isTranslating = true;
    this.isPaused = false;
    this.isCancelled = false;

    const settings = await storageService.getSettings();
    const targetLanguage = targetLang || settings.targetLanguage;

    this.updateProgress({
      status: 'translating',
      totalChunks: 0,
      completedChunks: 0,
      percentage: 0,
      errorMessage: undefined
    });

    try {
      const { nodes, items } = extractPageTextNodes(document.body, settings.preserveCode);

      if (items.length === 0) {
        this.updateProgress({
          status: 'completed',
          totalChunks: 0,
          completedChunks: 0,
          percentage: 100
        });
        this.isTranslating = false;
        return;
      }

      const batches = createTranslationBatches(items, {
        maxItemsPerBatch: 25,
        maxCharsPerBatch: 3000
      });

      const totalBatches = batches.length;
      this.updateProgress({
        totalChunks: totalBatches,
        completedChunks: 0,
        percentage: 0
      });

      for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
        if (this.isCancelled) {
          this.updateProgress({ status: 'cancelled' });
          break;
        }

        while (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (this.isCancelled) break;
        }

        if (this.isCancelled) {
          this.updateProgress({ status: 'cancelled' });
          break;
        }

        const batch = batches[bIndex];
        const uncachedChunks: TranslationChunk[] = [];

        // Check cache first
        for (const chunk of batch) {
          const cached = translationCache.get(chunk.text, targetLanguage, settings.translationStyle);
          if (cached !== undefined) {
            const node = nodes[chunk.nodeIndex!];
            if (node) {
              textReplacer.replaceNodeText(node, cached);
            }
          } else {
            uncachedChunks.push(chunk);
          }
        }

        // Fetch remaining translations from Gemini
        if (uncachedChunks.length > 0) {
          const aiResult = await geminiClient.translateBatch(uncachedChunks, {
            targetLanguage,
            style: settings.translationStyle
          });

          const transMap = new Map<number, string>();
          for (const item of aiResult.translations) {
            transMap.set(item.id, item.translation);
          }

          for (const chunk of uncachedChunks) {
            const translatedText = transMap.get(chunk.id);
            if (translatedText) {
              const node = nodes[chunk.nodeIndex!];
              if (node) {
                textReplacer.replaceNodeText(node, translatedText);
              }
              translationCache.set(
                chunk.text,
                targetLanguage,
                settings.translationStyle,
                translatedText
              );
            }
          }
        }

        const completed = bIndex + 1;
        const pct = Math.round((completed / totalBatches) * 100);
        this.updateProgress({
          completedChunks: completed,
          percentage: pct
        });
      }

      if (!this.isCancelled) {
        this.updateProgress({
          status: 'completed',
          completedChunks: totalBatches,
          percentage: 100
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      this.updateProgress({
        status: 'error',
        errorMessage: error.message || 'Page translation failed'
      });
    } finally {
      this.isTranslating = false;
    }
  }

  public pause(): void {
    if (this.isTranslating && !this.isPaused) {
      this.isPaused = true;
      this.updateProgress({ status: 'paused' });
    }
  }

  public resume(): void {
    if (this.isTranslating && this.isPaused) {
      this.isPaused = false;
      this.updateProgress({ status: 'translating' });
    }
  }

  public cancel(): void {
    this.isCancelled = true;
    this.isPaused = false;
    this.isTranslating = false;
    this.updateProgress({ status: 'cancelled' });
  }

  public restoreOriginal(): void {
    this.cancel();
    this.updateProgress({ status: 'restoring' });
    textReplacer.restoreOriginalPage();
    this.updateProgress({
      status: 'idle',
      totalChunks: 0,
      completedChunks: 0,
      percentage: 0
    });
  }
}

export const pageTranslator = PageTranslator.getInstance();
