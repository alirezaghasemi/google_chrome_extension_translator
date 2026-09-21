import {
  NormalizedRect,
  normalizeRect,
  isMeaningfulSelection,
  viewportToDocumentRect
} from './coords';

export type SelectionCallback = (rect: NormalizedRect) => void;
export type CancelCallback = () => void;

export class RegionSelector {
  private static instance: RegionSelector;
  private isActive = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private isMouseDown = false;

  private currentShadowRoot: ShadowRoot | null = null;
  private overlayContainer: HTMLElement | null = null;
  private svgMaskRect: SVGRectElement | null = null;
  private selectionBox: HTMLElement | null = null;
  private dimensionsBadge: HTMLElement | null = null;

  private persistentBox: HTMLElement | null = null;
  private persistentDocRect: NormalizedRect | null = null;
  private outsideClickListenerAttached = false;

  private onSelectCb: SelectionCallback | null = null;
  private onCancelCb: CancelCallback | null = null;

  public static getInstance(): RegionSelector {
    if (!RegionSelector.instance) {
      RegionSelector.instance = new RegionSelector();
    }
    return RegionSelector.instance;
  }

  /**
   * Activates region selection mode.
   */
  public start(
    shadowRoot: ShadowRoot,
    onSelect: SelectionCallback,
    onCancel?: CancelCallback
  ): void {
    if (this.isActive) {
      this.cancel();
    }

    this.clearPersistentBox();

    this.isActive = true;
    this.currentShadowRoot = shadowRoot;
    this.onSelectCb = onSelect;
    this.onCancelCb = onCancel || null;
    this.isMouseDown = false;

    this.createOverlay(shadowRoot);
    this.bindEvents();
  }

  private createOverlay(shadowRoot: ShadowRoot): void {
    const container = document.createElement('div');
    container.className = 'region-selection-overlay';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483645;
      cursor: crosshair;
      user-select: none;
      pointer-events: all;
    `;

    // SVG with clip mask to dim everything except selected box
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
    svg.innerHTML = `
      <defs>
        <mask id="selection-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect id="mask-hole" x="0" y="0" width="0" height="0" fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.45)" mask="url(#selection-mask)" />
    `;

    // Selection border box
    const box = document.createElement('div');
    box.className = 'selection-box';
    box.style.cssText = `
      position: absolute;
      display: none;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 4px 12px rgba(0, 0, 0, 0.2);
      pointer-events: none;
      border-radius: 4px;
    `;

    // Dimensions badge
    const badge = document.createElement('div');
    badge.className = 'selection-dimensions';
    badge.style.cssText = `
      position: absolute;
      bottom: -28px;
      right: 0;
      background: #1e293b;
      color: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      pointer-events: none;
    `;

    // Instructions hint
    const hint = document.createElement('div');
    hint.style.cssText = `
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.9);
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    hint.innerHTML = '<span>Drag mouse to select an area • Press <b>ESC</b> to cancel</span>';

    box.appendChild(badge);
    container.appendChild(svg);
    container.appendChild(box);
    container.appendChild(hint);
    shadowRoot.appendChild(container);

    this.overlayContainer = container;
    this.svgMaskRect = container.querySelector('#mask-hole');
    this.selectionBox = box;
    this.dimensionsBadge = badge;
  }

  private bindEvents = (): void => {
    window.addEventListener('mousedown', this.handleMouseDown, true);
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('mouseup', this.handleMouseUp, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
  };

  private unbindEvents = (): void => {
    window.removeEventListener('mousedown', this.handleMouseDown, true);
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('mouseup', this.handleMouseUp, true);
    window.removeEventListener('keydown', this.handleKeyDown, true);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    e.stopPropagation();

    this.isMouseDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;

    this.updateVisuals();
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isMouseDown) return;
    e.preventDefault();
    e.stopPropagation();

    this.currentX = e.clientX;
    this.currentY = e.clientY;

    this.updateVisuals();
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isMouseDown) return;
    e.preventDefault();
    e.stopPropagation();

    this.isMouseDown = false;
    const rect = normalizeRect(this.startX, this.startY, this.currentX, this.currentY);

    if (isMeaningfulSelection(rect)) {
      const cb = this.onSelectCb;
      const shadowRoot = this.currentShadowRoot;

      // 1. Clean up active drawing overlay
      this.cleanupActiveSelection();

      // 2. Display persistent selection box around the selected text
      if (shadowRoot) {
        this.showPersistentBox(shadowRoot, rect);
      }

      // 3. Trigger translation callback
      if (cb) cb(rect);
    } else {
      this.cancel();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
    }
  };

  private updateVisuals(): void {
    if (!this.selectionBox || !this.svgMaskRect || !this.dimensionsBadge) return;

    const rect = normalizeRect(this.startX, this.startY, this.currentX, this.currentY);

    this.selectionBox.style.display = 'block';
    this.selectionBox.style.left = `${rect.left}px`;
    this.selectionBox.style.top = `${rect.top}px`;
    this.selectionBox.style.width = `${rect.width}px`;
    this.selectionBox.style.height = `${rect.height}px`;

    this.svgMaskRect.setAttribute('x', `${rect.left}`);
    this.svgMaskRect.setAttribute('y', `${rect.top}`);
    this.svgMaskRect.setAttribute('width', `${rect.width}`);
    this.svgMaskRect.setAttribute('height', `${rect.height}`);

    this.dimensionsBadge.textContent = `${rect.width} × ${rect.height} px`;
  }

  /**
   * Shows a persistent highlight box around the selected area and listens for clicks outside.
   */
  private showPersistentBox(shadowRoot: ShadowRoot, rect: NormalizedRect): void {
    this.clearPersistentBox();

    this.persistentDocRect = viewportToDocumentRect(rect);

    const box = document.createElement('div');
    box.className = 'persistent-selection-box';
    box.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 2px solid #2563eb;
      background: rgba(37, 99, 235, 0.12);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7), 0 4px 16px rgba(37, 99, 235, 0.25);
      border-radius: 6px;
      pointer-events: none;
      z-index: 2147483640;
      transition: opacity 0.2s ease;
    `;

    shadowRoot.appendChild(box);
    this.persistentBox = box;

    window.addEventListener('scroll', this.syncPersistentBoxPos, { passive: true });
    window.addEventListener('resize', this.syncPersistentBoxPos);

    // Attach outside-click and Escape listeners on next tick to avoid capturing the current mouseup
    setTimeout(() => {
      if (!this.persistentBox) return;
      window.addEventListener('mousedown', this.handleOutsideClick, true);
      window.addEventListener('keydown', this.handlePersistentKeyDown, true);
      this.outsideClickListenerAttached = true;
    }, 100);
  }

  private syncPersistentBoxPos = (): void => {
    if (!this.persistentBox || !this.persistentDocRect) return;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const curLeft = this.persistentDocRect.left - scrollX;
    const curTop = this.persistentDocRect.top - scrollY;

    this.persistentBox.style.left = `${curLeft}px`;
    this.persistentBox.style.top = `${curTop}px`;
  };

  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.persistentBox) return;

    // 1. Check if click was inside the persistent selection box
    const boxRect = this.persistentBox.getBoundingClientRect();
    const isInsideBox =
      e.clientX >= boxRect.left &&
      e.clientX <= boxRect.right &&
      e.clientY >= boxRect.top &&
      e.clientY <= boxRect.bottom;

    if (isInsideBox) {
      // Clicked inside the box -> keep it
      return;
    }

    // 2. Check if click was inside the extension UI (floating panel, modals, etc.)
    const path = e.composedPath ? e.composedPath() : [];
    const isInsideExtension = path.some((el) => {
      const element = el as HTMLElement;
      return (
        element.classList?.contains?.('floating-panel') ||
        element.classList?.contains?.('panels-container') ||
        element.classList?.contains?.('modal-card') ||
        element.classList?.contains?.('modal-overlay') ||
        element.id === 'antigravity-shadow-app-root' ||
        element.getAttribute?.('data-extension-ui') === 'true'
      );
    });

    if (isInsideExtension) {
      // Clicked inside translation popup -> keep it
      return;
    }

    // 3. Clicked outside both the selection box and the translation panel -> remove selection box!
    this.clearPersistentBox();
  };

  private handlePersistentKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.clearPersistentBox();
    }
  };

  /**
   * Cleans up the persistent selection highlight box.
   */
  public clearPersistentBox(): void {
    if (this.outsideClickListenerAttached) {
      window.removeEventListener('mousedown', this.handleOutsideClick, true);
      window.removeEventListener('keydown', this.handlePersistentKeyDown, true);
      this.outsideClickListenerAttached = false;
    }
    window.removeEventListener('scroll', this.syncPersistentBoxPos);
    window.removeEventListener('resize', this.syncPersistentBoxPos);

    if (this.persistentBox && this.persistentBox.parentNode) {
      this.persistentBox.parentNode.removeChild(this.persistentBox);
    }

    this.persistentBox = null;
    this.persistentDocRect = null;
  }

  public cancel(): void {
    const cb = this.onCancelCb;
    this.cleanup();
    if (cb) cb();
  }

  private cleanupActiveSelection(): void {
    this.isActive = false;
    this.isMouseDown = false;
    this.unbindEvents();

    if (this.overlayContainer && this.overlayContainer.parentNode) {
      this.overlayContainer.parentNode.removeChild(this.overlayContainer);
    }

    this.overlayContainer = null;
    this.svgMaskRect = null;
    this.selectionBox = null;
    this.dimensionsBadge = null;
    this.onSelectCb = null;
    this.onCancelCb = null;
  }

  private cleanup(): void {
    this.cleanupActiveSelection();
    this.clearPersistentBox();
  }
}

export const regionSelector = RegionSelector.getInstance();
