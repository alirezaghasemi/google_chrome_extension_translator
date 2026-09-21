import { ExtensionSettings, StoredSettings } from '../../types/settings';
import { DEFAULT_SETTINGS } from './defaults';

const STORAGE_KEY = 'antigravity_ai_settings';

export class StorageService {
  private static instance: StorageService;
  private memoryCache: ExtensionSettings | null = null;
  private changeListeners: Array<(settings: ExtensionSettings) => void> = [];

  private constructor() {
    this.initChangeListener();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private initChangeListener(): void {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) {
          const newStored = changes[STORAGE_KEY].newValue as StoredSettings | undefined;
          const merged = { ...DEFAULT_SETTINGS, ...(newStored || {}) };
          this.memoryCache = merged;
          this.notifyListeners(merged);
        }
      });
    }
  }

  private notifyListeners(settings: ExtensionSettings): void {
    for (const listener of this.changeListeners) {
      try {
        listener(settings);
      } catch (err) {
        console.error('Error in settings listener:', err);
      }
    }
  }

  public onSettingsChanged(listener: (settings: ExtensionSettings) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  public async getSettings(): Promise<ExtensionSettings> {
    if (this.memoryCache) {
      return { ...this.memoryCache };
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const stored = (result[STORAGE_KEY] || {}) as StoredSettings;
        const merged: ExtensionSettings = { ...DEFAULT_SETTINGS, ...stored };
        this.memoryCache = merged;
        return merged;
      } else if (typeof localStorage !== 'undefined') {
        // Fallback for tests / non-extension contexts
        const raw = localStorage.getItem(STORAGE_KEY);
        const stored = raw ? (JSON.parse(raw) as StoredSettings) : {};
        const merged: ExtensionSettings = { ...DEFAULT_SETTINGS, ...stored };
        this.memoryCache = merged;
        return merged;
      }
    } catch (err) {
      console.warn('StorageService: failed to read storage, using defaults', err);
    }

    return { ...DEFAULT_SETTINGS };
  }

  public async saveSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.getSettings();
    const updated: ExtensionSettings = { ...current, ...partial };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: updated });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
      this.memoryCache = updated;
      this.notifyListeners(updated);
    } catch (err) {
      console.error('StorageService: failed to save settings', err);
      throw err;
    }

    return updated;
  }

  public async getApiKey(): Promise<string> {
    const settings = await this.getSettings();
    return settings.geminiApiKey || '';
  }

  public async setApiKey(apiKey: string): Promise<void> {
    await this.saveSettings({ geminiApiKey: apiKey.trim() });
  }

  public async deleteApiKey(): Promise<void> {
    await this.saveSettings({ geminiApiKey: '' });
  }
}

export const storageService = StorageService.getInstance();
