import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('offscreen document message routing', () => {
    let messageListener:
        | ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean)
        | undefined;
    let originalChrome: unknown;
    let originalClipboardItem: unknown;
    let originalXHR: unknown;
    let originalImage: unknown;
    let clipboardWriteMock: ReturnType<typeof vi.fn>;

    const flushAsync = async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    };

    beforeEach(async () => {
        vi.resetModules();

        document.body.innerHTML = '<canvas id="canvas"></canvas>';
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;

        const context2d = {
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            clearRect: vi.fn(),
            fillStyle: '#000000',
        } as unknown as CanvasRenderingContext2D;

        vi.spyOn(canvas, 'getContext').mockReturnValue(context2d);
        vi.spyOn(canvas, 'toDataURL').mockImplementation((type?: string) => `data:${type ?? 'image/png'};base64,mock`);

        clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { write: clipboardWriteMock },
            configurable: true,
        });

        originalClipboardItem = (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
        (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = class {
            constructor(public readonly data: Record<string, Blob>) {}
        };

        class MockXMLHttpRequest {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            responseType = '';
            response: Blob = new Blob(['x'], { type: 'image/png' });

            open(): void {}

            send(): void {
                this.onload?.();
            }
        }

        originalXHR = (globalThis as unknown as { XMLHttpRequest?: unknown }).XMLHttpRequest;
        (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXMLHttpRequest;

        originalImage = (globalThis as unknown as { Image?: unknown }).Image;
        (globalThis as unknown as { Image: unknown }).Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 200;
            height = 100;

            set src(_value: string) {
                setTimeout(() => this.onload?.(), 0);
            }
        };

        originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                onMessage: {
                    addListener: vi.fn((listener: typeof messageListener) => {
                        messageListener = listener;
                    }),
                },
            },
        };

        await import('./index');
    });

    afterEach(() => {
        (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;

        if (originalClipboardItem === undefined) {
            delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
        } else {
            (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = originalClipboardItem;
        }

        if (originalXHR === undefined) {
            delete (globalThis as unknown as { XMLHttpRequest?: unknown }).XMLHttpRequest;
        } else {
            (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = originalXHR;
        }

        if (originalImage === undefined) {
            delete (globalThis as unknown as { Image?: unknown }).Image;
        } else {
            (globalThis as unknown as { Image: unknown }).Image = originalImage;
        }

        vi.restoreAllMocks();
    });

    it('ignores unsupported actions', () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

        expect(returned).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    it('handles COPY_TO_CLIPBOARD success', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.({ action: 'COPY_TO_CLIPBOARD', dataUrl: 'data:image/png;base64,abc' }, {}, sendResponse);

        expect(returned).toBe(true);
        await flushAsync();

        expect(clipboardWriteMock).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('handles COPY_TO_CLIPBOARD failure', async () => {
        clipboardWriteMock.mockRejectedValueOnce(new Error('clipboard denied'));
        const sendResponse = vi.fn();

        const returned = messageListener?.({ action: 'COPY_TO_CLIPBOARD', dataUrl: 'data:image/png;base64,abc' }, {}, sendResponse);

        expect(returned).toBe(true);
        await flushAsync();

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'clipboard denied' });
    });

    it('returns failure when STITCH_IMAGES has no tiles', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.(
            { action: 'STITCH_IMAGES', images: [], totalWidth: 100, totalHeight: 100, dpr: 1 },
            {},
            sendResponse
        );

        expect(returned).toBe(true);
        await flushAsync();

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'No tiles to stitch' });
    });

    it('handles CONVERT_FORMAT success for jpeg', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.(
            { action: 'CONVERT_FORMAT', dataUrl: 'data:image/png;base64,abc', format: 'jpeg', quality: 0.8 },
            {},
            sendResponse
        );

        expect(returned).toBe(true);
        await flushAsync();

        expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: expect.stringContaining('data:image/jpeg;base64,mock') })
        );
    });

    it('returns failure when CROP_IMAGE has invalid crop dimensions', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.(
            {
                action: 'CROP_IMAGE',
                dataUrl: 'data:image/png;base64,abc',
                rect: { x: 0, y: 0, width: 0, height: 10, top: 0, right: 0, bottom: 10, left: 0 },
                dpr: 2,
                viewport: { innerWidth: 100, innerHeight: 50, scrollX: 0, scrollY: 0 },
            },
            {},
            sendResponse
        );

        expect(returned).toBe(true);
        await flushAsync();

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid crop dimensions' });
    });

    it('handles STITCH_IMAGES success with tiles', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.(
            {
                action: 'STITCH_IMAGES',
                images: [
                    { dataUrl: 'data:image/png;base64,t1', x: 0, y: 0, cssWidth: 100, cssHeight: 50 },
                    { dataUrl: 'data:image/png;base64,t2', x: 100, y: 0, cssWidth: 100, cssHeight: 50 },
                ],
                totalWidth: 200,
                totalHeight: 50,
                dpr: 2,
            },
            {},
            sendResponse
        );

        expect(returned).toBe(true);
        await flushAsync();
        await flushAsync();
        await flushAsync();

        expect(sendResponse).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, data: expect.stringContaining('data:image/png;base64,mock') })
        );
    });
});
