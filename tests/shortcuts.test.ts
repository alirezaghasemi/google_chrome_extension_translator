import { describe, it, expect } from 'vitest';
import manifest from '../manifest.json';
import {
  getActionFromKeyEvent,
  getCommandMessageType,
  ACTION_SHORTCUTS,
  getDisplayShortcut,
  isEditableElement
} from '../src/utils/shortcuts';

describe('Chrome Commands & Manifest Shortcuts', () => {
  it('should define all 4 commands in manifest.json', () => {
    const commands = manifest.commands as Record<string, { suggested_key?: { default?: string }; description?: string }>;
    expect(commands).toBeDefined();

    const expectedCommands = [
      'translate-page',
      'translate-region',
      'capture-screenshot',
      'capture-fullpage'
    ];

    for (const cmd of expectedCommands) {
      expect(commands[cmd], `Command ${cmd} should exist in manifest.json`).toBeDefined();
      expect(commands[cmd].description).toBeTruthy();
      expect(commands[cmd].suggested_key?.default).toBeTruthy();
    }
  });

  it('should not use restricted Chrome tab-switching keys (Ctrl+1 to Ctrl+8)', () => {
    const commands = manifest.commands as Record<string, { suggested_key?: Record<string, string> }>;
    const forbiddenPatterns = [/^Ctrl\+[1-8]$/i, /^Command\+[1-8]$/i];

    for (const [cmdName, cmdConfig] of Object.entries(commands)) {
      if (cmdConfig.suggested_key) {
        for (const [platform, keyCombo] of Object.entries(cmdConfig.suggested_key)) {
          for (const pattern of forbiddenPatterns) {
            expect(
              pattern.test(keyCombo),
              `Command ${cmdName} platform ${platform} key ${keyCombo} conflicts with Chrome tab switching`
            ).toBe(false);
          }
        }
      }
    }
  });

  it('should map background commands to correct message types', () => {
    expect(getCommandMessageType('translate-page')).toBe('START_PAGE_TRANSLATION');
    expect(getCommandMessageType('translate-region')).toBe('START_REGION_SELECTION');
    expect(getCommandMessageType('capture-screenshot')).toBe('TRIGGER_VIEWPORT_SCREENSHOT');
    expect(getCommandMessageType('capture-fullpage')).toBe('TRIGGER_FULLPAGE_SCREENSHOT');
    expect(getCommandMessageType('unknown-cmd')).toBeNull();
  });
});

describe('Shift + 1/2/3/4 Keyboard Shortcuts', () => {
  it('should format display shortcuts as Shift + 1, 2, 3, 4', () => {
    expect(getDisplayShortcut('translate-page', false)).toBe('Shift+1');
    expect(getDisplayShortcut('translate-region', false)).toBe('Shift+2');
    expect(getDisplayShortcut('capture-screenshot', false)).toBe('Shift+3');
    expect(getDisplayShortcut('capture-fullpage', false)).toBe('Shift+4');

    expect(getDisplayShortcut('translate-page', true)).toBe('⇧1');
    expect(getDisplayShortcut('translate-region', true)).toBe('⇧2');
    expect(getDisplayShortcut('capture-screenshot', true)).toBe('⇧3');
    expect(getDisplayShortcut('capture-fullpage', true)).toBe('⇧4');
    expect(ACTION_SHORTCUTS).toHaveLength(4);
  });

  it('should resolve Shift + 1/2/3/4 events to correct actions', () => {
    const createShiftEvent = (code: string, key: string) =>
      ({
        code,
        key,
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV' },
        preventDefault: () => {}
      } as unknown as KeyboardEvent);

    // Standard US keyboard Shift+1 produces '!' with code 'Digit1'
    expect(getActionFromKeyEvent(createShiftEvent('Digit1', '!'))).toBe('translate-page');
    expect(getActionFromKeyEvent(createShiftEvent('Digit2', '@'))).toBe('translate-region');
    expect(getActionFromKeyEvent(createShiftEvent('Digit3', '#'))).toBe('capture-screenshot');
    expect(getActionFromKeyEvent(createShiftEvent('Digit4', '$'))).toBe('capture-fullpage');

    // Also when key is numeric '1'-'4' with shiftKey
    expect(getActionFromKeyEvent(createShiftEvent('Digit1', '1'))).toBe('translate-page');
    expect(getActionFromKeyEvent(createShiftEvent('Digit2', '2'))).toBe('translate-region');
    expect(getActionFromKeyEvent(createShiftEvent('Digit3', '3'))).toBe('capture-screenshot');
    expect(getActionFromKeyEvent(createShiftEvent('Digit4', '4'))).toBe('capture-fullpage');

    // Numbers without shift also supported for quick popup accessibility
    const createPlainEvent = (key: string) =>
      ({
        code: `Digit${key}`,
        key,
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: { tagName: 'DIV' },
        preventDefault: () => {}
      } as unknown as KeyboardEvent);

    expect(getActionFromKeyEvent(createPlainEvent('1'))).toBe('translate-page');
    expect(getActionFromKeyEvent(createPlainEvent('2'))).toBe('translate-region');
    expect(getActionFromKeyEvent(createPlainEvent('3'))).toBe('capture-screenshot');
    expect(getActionFromKeyEvent(createPlainEvent('4'))).toBe('capture-fullpage');
  });

  it('should ignore key events inside input, textarea, and contentEditable', () => {
    const inputEl = document.createElement('input');
    const textareaEl = document.createElement('textarea');
    const editableDiv = document.createElement('div');
    editableDiv.contentEditable = 'true';
    const plainDiv = document.createElement('div');

    expect(isEditableElement(inputEl)).toBe(true);
    expect(isEditableElement(textareaEl)).toBe(true);
    expect(isEditableElement(editableDiv)).toBe(true);
    expect(isEditableElement(plainDiv)).toBe(false);

    const inputEvent = {
      code: 'Digit1',
      key: '!',
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      target: inputEl,
      preventDefault: () => {}
    } as unknown as KeyboardEvent;

    expect(getActionFromKeyEvent(inputEvent)).toBeNull();
  });
});
