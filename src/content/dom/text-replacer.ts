export interface ReplacementRecord {
  node: Node;
  originalText: string;
}

export class TextReplacer {
  private static instance: TextReplacer;
  private modifiedNodes: Map<Node, string> = new Map();

  public static getInstance(): TextReplacer {
    if (!TextReplacer.instance) {
      TextReplacer.instance = new TextReplacer();
    }
    return TextReplacer.instance;
  }

  /**
   * Replaces the text content of a DOM node, saving its original string for restoration.
   */
  public replaceNodeText(node: Node, newText: string): void {
    if (!this.modifiedNodes.has(node)) {
      this.modifiedNodes.set(node, node.textContent || '');
    }
    node.textContent = newText;
  }

  /**
   * Reverts all modified nodes back to their original text.
   */
  public restoreOriginalPage(): number {
    let count = 0;
    for (const [node, originalText] of this.modifiedNodes.entries()) {
      try {
        if (node.parentNode) {
          node.textContent = originalText;
          count++;
        }
      } catch (err) {
        console.warn('Failed to restore text node:', err);
      }
    }
    this.modifiedNodes.clear();
    return count;
  }

  /**
   * Checks if any nodes on the page have been translated and modified.
   */
  public isPageTranslated(): boolean {
    return this.modifiedNodes.size > 0;
  }

  /**
   * Gets the original text of a node if it was modified.
   */
  public getOriginalText(node: Node): string | undefined {
    return this.modifiedNodes.get(node);
  }

  /**
   * Clears tracked modifications without restoring (e.g. on manual reset).
   */
  public clearTracking(): void {
    this.modifiedNodes.clear();
  }
}

export const textReplacer = TextReplacer.getInstance();
