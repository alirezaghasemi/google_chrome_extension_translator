import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../src/services/storage/storage-service';
import { DEFAULT_SETTINGS } from '../src/services/storage/defaults';

describe('StorageService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return default settings when storage is empty', async () => {
    const service = StorageService.getInstance();
    const settings = await service.getSettings();

    expect(settings.targetLanguage).toBe(DEFAULT_SETTINGS.targetLanguage);
    expect(settings.geminiModel).toBe(DEFAULT_SETTINGS.geminiModel);
    expect(settings.explainTerms).toBe(true);
  });

  it('should save and retrieve partial settings', async () => {
    const service = StorageService.getInstance();
    await service.saveSettings({ targetLanguage: 'de', theme: 'dark' });

    const updated = await service.getSettings();
    expect(updated.targetLanguage).toBe('de');
    expect(updated.theme).toBe('dark');
    expect(updated.geminiModel).toBe(DEFAULT_SETTINGS.geminiModel); // untouched
  });

  it('should store and delete API key securely', async () => {
    const service = StorageService.getInstance();
    await service.setApiKey('AIzaSyTest123');

    let key = await service.getApiKey();
    expect(key).toBe('AIzaSyTest123');

    await service.deleteApiKey();
    key = await service.getApiKey();
    expect(key).toBe('');
  });
});
