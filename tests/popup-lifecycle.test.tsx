import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Popup } from '../src/popup/Popup';

describe('Popup Hook Lifecycle', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        sendMessage: vi.fn().mockResolvedValue({ success: true, data: { isTranslated: false, progress: { status: 'idle' } } })
      },
      runtime: {
        openOptionsPage: vi.fn(),
        getURL: vi.fn().mockReturnValue('chrome-extension://test')
      }
    };
  });

  it('should render across multiple renders without violating Rules of Hooks (React error 310)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let errorCaught: Error | null = null;
    try {
      await act(async () => {
        root.render(<Popup />);
      });
      // Allow async state update (settings resolution) to trigger re-render
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    } catch (err) {
      errorCaught = err as Error;
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }

    expect(errorCaught).toBeNull();
  });
});
