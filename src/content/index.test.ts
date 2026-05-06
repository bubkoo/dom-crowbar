import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nodeOverlay, screenshotResult } from '.';

function mockRect(partial: Partial<DOMRect> & { width: number; height: number; left: number; top: number }): DOMRect {
  const rect = {
    ...partial,
    x: partial.left,
    y: partial.top,
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
    toJSON: () => ({}),
  };
  return rect as unknown as DOMRect;
}

describe('nodeOverlay', () => {
  let container: HTMLDivElement;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    nodeOverlay.exit();
    container.remove();
    document.body.style.cursor = '';
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should create and remove overlay elements on enter/exit', () => {
    nodeOverlay.enter();

    expect(document.querySelector('#dom-crowbar-overlay')).not.toBeNull();
    expect(document.querySelector('#dom-crowbar-badge')).not.toBeNull();
    expect(document.body.style.cursor).toBe('crosshair');

    nodeOverlay.exit();

    expect(document.querySelector('#dom-crowbar-overlay')).toBeNull();
    expect(document.querySelector('#dom-crowbar-badge')).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('should highlight target on mouse move and update badge', () => {
    container.innerHTML = '<div id="target"></div>';
    const target = container.querySelector('#target') as HTMLDivElement;

    (target as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = vi.fn(() =>
      mockRect({ left: 10, top: 20, width: 100, height: 50 })
    );

    nodeOverlay.enter();

    const badge = document.querySelector('#dom-crowbar-badge') as HTMLDivElement;
    (badge as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = vi.fn(() =>
      mockRect({ left: 0, top: 0, width: 80, height: 16 })
    );

    target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));

    const overlay = document.querySelector('#dom-crowbar-overlay') as HTMLDivElement;
    expect(overlay.style.display).toBe('block');
    expect(overlay.style.left).toBe('10px');
    expect(overlay.style.top).toBe('20px');
    expect(overlay.style.width).toBe('100px');
    expect(overlay.style.height).toBe('50px');

    expect(badge.style.display).toBe('block');
    expect(badge.textContent).toContain('#target');
    expect(badge.textContent).toContain('100 × 50');
  });

  it('should call onSelect and exit on click', async () => {
    container.innerHTML = '<div id="target"></div>';
    const target = container.querySelector('#target') as HTMLDivElement;
    const onSelect = vi.fn();

    (target as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = vi.fn(() =>
      mockRect({ left: 10, top: 20, width: 100, height: 50 })
    );

    nodeOverlay.onSelect(onSelect);
    nodeOverlay.enter();

    (nodeOverlay as unknown as { selectElement: (el: Element) => void }).selectElement(target);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('#target', expect.objectContaining({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    }));

    expect(document.querySelector('#dom-crowbar-overlay')).toBeNull();
    expect(document.querySelector('#dom-crowbar-badge')).toBeNull();
    expect(document.body.style.cursor).toBe('');
  });

  it('should call onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    nodeOverlay.onCancel(onCancel);
    nodeOverlay.enter();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#dom-crowbar-overlay')).toBeNull();
    expect(document.querySelector('#dom-crowbar-badge')).toBeNull();
  });
});

describe('screenshotResult', () => {
  const dataUrl = 'data:image/png;base64,AAAA';
  let originalChrome: unknown;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('should copy to clipboard and trigger download', async () => {
    const sendMessage = vi.fn().mockImplementation((message: { action: string }) => {
      if (message.action === 'COPY_TO_CLIPBOARD') {
        return Promise.resolve({ success: true });
      }

      return Promise.resolve(undefined);
    });
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage },
    };

    await screenshotResult.handleSuccess(dataUrl, 100, 50, '#my-element');

    expect(sendMessage).toHaveBeenCalledWith({ action: 'COPY_TO_CLIPBOARD', dataUrl });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'DOWNLOAD_IMAGE' }));
  });

  it('should not throw if clipboard copy fails', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('clipboard error'));
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage },
    };

    await expect(screenshotResult.handleSuccess(dataUrl, 100, 50, '.my-class')).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'DOWNLOAD_IMAGE' }));
  });

  it('should fallback to background download when anchor click throws', async () => {
    const sendMessage = vi.fn().mockImplementation((message: { action: string }) => {
      if (message.action === 'COPY_TO_CLIPBOARD') {
        return Promise.resolve({ success: true });
      }

      if (message.action === 'DOWNLOAD_IMAGE') {
        return Promise.resolve({ success: true });
      }

      return Promise.resolve(undefined);
    });

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        (element as HTMLAnchorElement).click = vi.fn(() => {
          throw new Error('anchor blocked');
        });
      }
      return element;
    });

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage },
    };

    await expect(screenshotResult.handleSuccess(dataUrl, 100, 50, '#fallback')).resolves.toBeUndefined();

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DOWNLOAD_IMAGE',
      dataUrl,
      filename: expect.stringMatching(/dom-crowbar-\d{8}T\d{6}\.png$/),
    }));

    createElementSpy.mockRestore();
  });

  it('should show error when anchor and background download both fail', async () => {
    const sendMessage = vi.fn().mockImplementation((message: { action: string }) => {
      if (message.action === 'COPY_TO_CLIPBOARD') {
        return Promise.resolve({ success: false, error: 'copy failed' });
      }

      if (message.action === 'DOWNLOAD_IMAGE') {
        return Promise.resolve({ success: false, error: 'background failed' });
      }

      return Promise.resolve(undefined);
    });

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        (element as HTMLAnchorElement).click = vi.fn(() => {
          throw new Error('anchor blocked');
        });
      }
      return element;
    });

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage },
    };

    await expect(screenshotResult.handleSuccess(dataUrl, 100, 50, '#all-fail')).resolves.toBeUndefined();

    expect(document.querySelector('#dom-crowbar-toast')?.textContent).toContain('Screenshot captured, but copy and download both failed.');

    createElementSpy.mockRestore();
  });
});
