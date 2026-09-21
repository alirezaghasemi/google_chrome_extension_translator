import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageTextNodes } from '../src/content/dom/text-extractor';

describe('TextExtractor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should extract translatable paragraph text while skipping script and style tags', () => {
    document.body.innerHTML = `
      <div id="container">
        <h1>Welcome to AI Extension</h1>
        <p>This is a test paragraph for translation.</p>
        <script>const secret = 'do not translate';</script>
        <style>.test { color: red; }</style>
        <pre><code>console.log('code block');</code></pre>
      </div>
    `;

    const { items } = extractPageTextNodes(document.body, true);
    const texts = items.map((i) => i.text.trim());

    expect(texts).toContain('Welcome to AI Extension');
    expect(texts).toContain('This is a test paragraph for translation.');
    expect(texts).not.toContain("const secret = 'do not translate';");
    expect(texts).not.toContain('.test { color: red; }');
    expect(texts).not.toContain("console.log('code block');");
  });
});
