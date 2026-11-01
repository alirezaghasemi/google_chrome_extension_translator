export type ShortcutCommand =
  | 'translate-page'
  | 'translate-region'
  | 'capture-screenshot'
  | 'capture-fullpage';

export interface ShortcutDefinition {
  id: ShortcutCommand;
  digit: number;
  messageType: string;
  defaultWindowsKey: string;
  defaultMacKey: string;
}

export const ACTION_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'translate-page',
    digit: 1,
    messageType: 'START_PAGE_TRANSLATION',
    defaultWindowsKey: 'Shift+1',
    defaultMacKey: '⇧1'
  },
  {
    id: 'translate-region',
    digit: 2,
    messageType: 'START_REGION_SELECTION',
    defaultWindowsKey: 'Shift+2',
    defaultMacKey: '⇧2'
  },
  {
    id: 'capture-screenshot',
    digit: 3,
    messageType: 'TRIGGER_VIEWPORT_SCREENSHOT',
    defaultWindowsKey: 'Shift+3',
    defaultMacKey: '⇧3'
  },
  {
    id: 'capture-fullpage',
    digit: 4,
    messageType: 'TRIGGER_FULLPAGE_SCREENSHOT',
    defaultWindowsKey: 'Shift+4',
    defaultMacKey: '⇧4'
  }
];

/**
 * Checks whether an element is an editable form field or rich text area.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName?.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (
    target.isContentEditable ||
    target.contentEditable === 'true' ||
    target.getAttribute?.('contenteditable') === 'true'
  ) {
    return true;
  }
  if (target.getAttribute?.('role') === 'textbox') {
    return true;
  }
  if (typeof target.closest === 'function') {
    const editable = target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]');
    if (editable) return true;
  }

  return false;
}

/**
 * Returns formatted display text for the shortcut badge based on OS.
 */
export function getDisplayShortcut(command: ShortcutCommand, isMac?: boolean): string {
  const isApple =
    isMac !== undefined
      ? isMac
      : typeof navigator !== 'undefined' &&
        /Mac|iPod|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

  const def = ACTION_SHORTCUTS.find((s) => s.id === command);
  if (!def) return '';

  return isApple ? def.defaultMacKey : def.defaultWindowsKey;
}

/**
 * Returns the corresponding extension message type for background commands.
 */
export function getCommandMessageType(command: string): string | null {
  const match = ACTION_SHORTCUTS.find((s) => s.id === command);
  return match ? match.messageType : null;
}

/**
 * Maps a keyboard event inside the popup or on a webpage to an action command.
 * Supports Shift + 1/2/3/4, Digit1-4, Numpad1-4, Persian/Arabic numerals,
 * and standard number keys.
 * Ignores input, textarea, and contentEditable elements.
 */
export function getActionFromKeyEvent(e: KeyboardEvent): ShortcutCommand | null {
  if (isEditableElement(e.target)) {
    return null;
  }

  const key = e.key;
  const code = (e as unknown as { code?: string }).code;

  if (
    key === '1' ||
    key === '!' ||
    key === '۱' ||
    key === '١' ||
    code === 'Digit1' ||
    code === 'Numpad1'
  ) {
    return 'translate-page';
  }
  if (
    key === '2' ||
    key === '@' ||
    key === '۲' ||
    key === '٢' ||
    code === 'Digit2' ||
    code === 'Numpad2'
  ) {
    return 'translate-region';
  }
  if (
    key === '3' ||
    key === '#' ||
    key === '۳' ||
    key === '٣' ||
    code === 'Digit3' ||
    code === 'Numpad3'
  ) {
    return 'capture-screenshot';
  }
  if (
    key === '4' ||
    key === '$' ||
    key === '۴' ||
    key === '٤' ||
    code === 'Digit4' ||
    code === 'Numpad4'
  ) {
    return 'capture-fullpage';
  }

  return null;
}
