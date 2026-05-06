import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMRectJson, ScrollContainerInfo, ViewportInfo } from '@shared/types';

vi.mock('./offscreen', () => ({
    cropImage: vi.fn(),
    stitchImages: vi.fn(),
}));

vi.mock('./fixed-elements', () => ({
    hideFixedElements: vi.fn(),
    restoreFixedElements: vi.fn(),
}));

import { handleNodeSelected } from './capture';
import { cropImage } from './offscreen';

const cropImageMock = vi.mocked(cropImage);

describe('handleNodeSelected expansion behavior', () => {
    const rect: DOMRectJson = {
        x: 0,
        y: 10,
        width: 100,
        height: 80,
        top: 10,
        right: 100,
        bottom: 90,
        left: 0,
    };

    const viewport: ViewportInfo = {
        innerWidth: 100,
        innerHeight: 100,
        scrollX: 0,
        scrollY: 0,
    };

    const forceScrollContainer: ScrollContainerInfo = {
        hasScrollableContainer: true,
    };

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
        cropImageMock.mockReset();
        cropImageMock.mockResolvedValue('data:image/png;base64,cropped');
    });

    afterEach(() => {
        (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
        consoleDebugSpy.mockRestore();
        consoleInfoSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('applies user expansion in scroll capture path', async () => {
        const executeScript = vi.fn(async ({ args }: { args?: unknown[] }) => {
            if (args?.length === 1 && typeof args[0] === 'string') {
                // getRectExpansion: live element rect after selection
                return [{ result: { top: 20, right: 80, bottom: 60, left: 40 } }];
            }

            if (args?.length === 3 && typeof args[0] === 'string') {
                const expansion = args[2] as { top: number; right: number; bottom: number; left: number };
                expect(expansion).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });

                // getElementRectAfterScroll returns rect rebuilt from expansion
                return [{
                    result: {
                        rect: {
                            x: 5,
                            y: 6,
                            width: 120,
                            height: 110,
                            left: 5,
                            top: 6,
                            right: 125,
                            bottom: 116,
                        },
                        offsetX: 40,
                        offsetY: 10,
                    },
                }];
            }

            // scrollToPosition / restore scroll scripts
            return [{}];
        });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            tabs: {
                get: vi.fn().mockResolvedValue({ status: 'complete', windowId: 1, url: 'https://example.com' }),
                captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,raw'),
                sendMessage: vi.fn().mockResolvedValue(undefined),
            },
            scripting: { executeScript },
        };

        const result = await handleNodeSelected(1, '#target', rect, 2, viewport, forceScrollContainer);

        expect(result.action).toBe('CAPTURE_SUCCESS');
        expect(cropImageMock).toHaveBeenCalledWith(
            'data:image/png;base64,raw',
            expect.objectContaining({ width: 120, height: 110, left: 5, top: 6 }),
            2,
            viewport
        );
    });

    it('falls back to selected rect when post-scroll query fails', async () => {
        const executeScript = vi.fn(async ({ args }: { args?: unknown[] }) => {
            if (args?.length === 1 && typeof args[0] === 'string') {
                // getRectExpansion: no additional expansion
                return [{ result: { top: 10, right: 100, bottom: 90, left: 0 } }];
            }

            if (args?.length === 3 && typeof args[0] === 'string') {
                // getElementRectAfterScroll -> element temporarily unavailable
                return [{ result: null }];
            }

            return [{}];
        });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            tabs: {
                get: vi.fn().mockResolvedValue({ status: 'complete', windowId: 1, url: 'https://example.com' }),
                captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,raw'),
                sendMessage: vi.fn().mockResolvedValue(undefined),
            },
            scripting: { executeScript },
        };

        const result = await handleNodeSelected(1, '#target', rect, 2, viewport, forceScrollContainer);

        expect(result.action).toBe('CAPTURE_SUCCESS');
        expect(cropImageMock).toHaveBeenCalledWith('data:image/png;base64,raw', rect, 2, viewport);
    });

    it('returns CAPTURE_ERROR when tab id is invalid', async () => {
        const result = await handleNodeSelected(0, '#target', rect, 2, viewport, forceScrollContainer);

        expect(result).toEqual({ action: 'CAPTURE_ERROR', reason: 'Invalid page tab' });
        expect(cropImageMock).not.toHaveBeenCalled();
    });
});
