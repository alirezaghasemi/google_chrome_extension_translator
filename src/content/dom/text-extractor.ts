import { isElementExcluded } from './dom-utils';

export interface ExtractedTextItem {
  nodeIndex: number;
  text: string;
}

export interface ExtractionResult {
  nodes: Node[];
  items: ExtractedTextItem[];
}

/**
 * Extracts translatable text nodes from the document body.
 * Skips code blocks if preserveCode is true, ignores hidden elements and scripts/inputs.
 */
export function extractPageTextNodes(root: HTMLElement = document.body, preserveCode = true): ExtractionResult {
  const nodes: Node[] = [];
  const items: ExtractedTextItem[] = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node: Node) => {
        const text = node.textContent?.trim() || '';
        if (text.length === 0) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent || isElementExcluded(parent, preserveCode)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let currentNode: Node | null = walker.nextNode();
  let index = 0;

  while (currentNode) {
    const rawText = currentNode.textContent || '';
    nodes.push(currentNode);
    items.push({
      nodeIndex: index,
      text: rawText
    });
    index++;
    currentNode = walker.nextNode();
  }

  return { nodes, items };
}
