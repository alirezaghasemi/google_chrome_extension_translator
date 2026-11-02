import { describe, it, expect } from 'vitest';
import { isPdfUrl } from '../src/services/pdf/pdf-utils';
import { getCommandMessageType } from '../src/utils/shortcuts';

describe('Shortcuts Safety & PDF Mode Integrity', () => {
  it('should correctly recognize PDF URLs to open PDF Reader mode instead of snipper', () => {
    expect(isPdfUrl('https://example.com/document.pdf')).toBe(true);
    expect(isPdfUrl('file:///home/user/document.pdf')).toBe(true);
    expect(isPdfUrl('http://site.org/paper.pdf?download=true')).toBe(true);
    expect(isPdfUrl('chrome-extension://xyz/pdf-viewer.html?src=file.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/index.html')).toBe(false);
  });

  it('should maintain standard background commands mapping for Chrome commands API', () => {
    expect(getCommandMessageType('translate-page')).toBe('START_PAGE_TRANSLATION');
    expect(getCommandMessageType('translate-region')).toBe('START_REGION_SELECTION');
    expect(getCommandMessageType('capture-screenshot')).toBe('TRIGGER_VIEWPORT_SCREENSHOT');
    expect(getCommandMessageType('capture-fullpage')).toBe('TRIGGER_FULLPAGE_SCREENSHOT');
  });
});

