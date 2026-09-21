import { describe, it, expect, beforeEach } from 'vitest';
import { TextReplacer } from '../src/content/dom/text-replacer';

describe('TextReplacer', () => {
  let replacer: TextReplacer;

  beforeEach(() => {
    replacer = new TextReplacer();
    document.body.innerHTML = '';
  });

  it('should replace text content and preserve original for full restoration', () => {
    const div = document.createElement('div');
    const textNode = document.createTextNode('Original English Text');
    div.appendChild(textNode);
    document.body.appendChild(div);

    expect(replacer.isPageTranslated()).toBe(false);

    replacer.replaceNodeText(textNode, 'متن ترجمه شده فارسی');
    expect(textNode.textContent).toBe('متن ترجمه شده فارسی');
    expect(replacer.isPageTranslated()).toBe(true);

    const restoredCount = replacer.restoreOriginalPage();
    expect(restoredCount).toBe(1);
    expect(textNode.textContent).toBe('Original English Text');
    expect(replacer.isPageTranslated()).toBe(false);
  });
});
