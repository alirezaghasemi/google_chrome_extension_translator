import { describe, it, expect } from 'vitest';
import {
  normalizeRect,
  isMeaningfulSelection,
  scaleRectForDevicePixelRatio
} from '../src/content/selection/coords';

describe('Selection Coordinates', () => {
  it('should normalize coordinates regardless of drag direction', () => {
    // Top-left to bottom-right
    const rect1 = normalizeRect(10, 20, 100, 150);
    expect(rect1).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 130,
      right: 100,
      bottom: 150
    });

    // Bottom-right to top-left
    const rect2 = normalizeRect(100, 150, 10, 20);
    expect(rect2).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 130,
      right: 100,
      bottom: 150
    });

    // Bottom-left to top-right
    const rect3 = normalizeRect(10, 150, 100, 20);
    expect(rect3).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 130,
      right: 100,
      bottom: 150
    });
  });

  it('should detect meaningful selections', () => {
    const tiny = normalizeRect(10, 10, 15, 15);
    expect(isMeaningfulSelection(tiny, 12)).toBe(false);

    const valid = normalizeRect(10, 10, 50, 50);
    expect(isMeaningfulSelection(valid, 12)).toBe(true);
  });

  it('should scale rectangle for devicePixelRatio', () => {
    const rect = normalizeRect(10, 20, 110, 120);
    const scaled = scaleRectForDevicePixelRatio(rect, 2);

    expect(scaled).toEqual({
      left: 20,
      top: 40,
      width: 200,
      height: 200,
      right: 220,
      bottom: 240
    });
  });
});

import { calculateDefaultPosition } from '../src/content/overlays/PanelManager';

describe('Panel Positioning', () => {
  it('should calculate bottom-right position without overflowing viewport', () => {
    // Mock window dimensions
    window.innerWidth = 1000;
    window.innerHeight = 800;

    const pos = calculateDefaultPosition('bottom-right', 420, 520, null);
    expect(pos.x).toBe(1000 - 420 - 24);
    expect(pos.y).toBe(800 - 520 - 24);
    // Panel should fit inside viewport
    expect(pos.x + 420).toBeLessThanOrEqual(1000);
    expect(pos.y + 520).toBeLessThanOrEqual(800);
  });

  it('should clamp remembered position if it overflows the viewport', () => {
    window.innerWidth = 1000;
    window.innerHeight = 800;

    // Saved position that would overflow bottom-right
    const saved = { x: 950, y: 750 };
    const pos = calculateDefaultPosition('remember', 420, 520, saved);

    // Clamped to 1000 - 420 - 16 = 564, 800 - 520 - 16 = 264
    expect(pos.x).toBe(564);
    expect(pos.y).toBe(264);
  });
});

