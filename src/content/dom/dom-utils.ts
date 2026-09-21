export const EXTENSION_ROOT_ID = 'antigravity-ai-extension-root';

export const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'CANVAS',
  'OBJECT',
  'EMBED',
  'IFRAME',
  'AUDIO',
  'VIDEO',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'PRE',
  'CODE',
  'KBD',
  'SAMP',
  'VAR'
]);

/**
 * Checks if an element or any of its ancestors should be excluded from translation.
 */
export function isElementExcluded(el: Element | null, preserveCode = true): boolean {
  let current: Element | null = el;

  while (current && current !== document.body) {
    // Skip extension root and its children
    if (current.id === EXTENSION_ROOT_ID || current.getAttribute('data-extension-ui') === 'true') {
      return true;
    }

    const tagName = current.tagName.toUpperCase();

    if (IGNORED_TAGS.has(tagName)) {
      if (!preserveCode && (tagName === 'PRE' || tagName === 'CODE' || tagName === 'KBD')) {
        // User opted to translate code blocks
      } else {
        return true;
      }
    }

    if (current.getAttribute('contenteditable') === 'true' || (current as HTMLElement).isContentEditable) {
      return true;
    }

    if (current.getAttribute('translate') === 'no') {
      return true;
    }

    // Check hidden elements
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) === 0
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}

/**
 * Checks if an element is visible in the viewport or rendered layout.
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (!el) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) {
    return false;
  }
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
}

/**
 * Finds the nearest heading or contextual parent container to provide context for a selection.
 */
export function findNearbyContext(node: Node): string {
  let current = node.parentElement;
  let context = '';

  // Look up ancestor tree for nearest heading or section
  while (current && current !== document.body) {
    const heading = current.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading && heading.textContent) {
      context = heading.textContent.trim();
      break;
    }
    current = current.parentElement;
  }

  return context;
}
