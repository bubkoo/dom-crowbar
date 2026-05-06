import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyToClipboard, cropImage, downloadImage, stitchImages } from './offscreen';

describe('background offscreen downloadImage', () => {
    let originalChrome: unknown;
    let runtimeLastError: { message?: string } | undefined;

    beforeEach(() => {
        originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;
        runtimeLastError = undefined;
    });

    afterEach(() => {
        (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
        vi.restoreAllMocks();
    });

    it('uses provided filename with chrome.downloads.download', async () => {
        const download = vi.fn((_options: unknown, callback: (id?: number) => void) => callback(123));

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                get lastError() {
                    return runtimeLastError;
                },
            },
            downloads: { download },
        };

        await expect(downloadImage('data:image/png;base64,abc', 'custom-name.png')).resolves.toBeUndefined();

        expect(download).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'data:image/png;base64,abc',
                filename: 'custom-name.png',
                saveAs: false,
                conflictAction: 'uniquify',
            }),
            expect.any(Function)
        );
    });

    it('falls back to timestamp filename when filename is missing', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-06T06:42:05Z'));

        const download = vi.fn((_options: unknown, callback: (id?: number) => void) => callback(1));

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                get lastError() {
                    return runtimeLastError;
                },
            },
            downloads: { download },
        };

        await expect(downloadImage('data:image/png;base64,abc')).resolves.toBeUndefined();

        expect(download).toHaveBeenCalledWith(
            expect.objectContaining({ filename: 'screenshot-1778049725000.png' }),
            expect.any(Function)
        );

        vi.useRealTimers();
    });

    it('rejects when chrome.runtime.lastError is present', async () => {
        const download = vi.fn((_options: unknown, callback: (id?: number) => void) => {
            runtimeLastError = { message: 'Permission denied' };
            callback(undefined);
            runtimeLastError = undefined;
        });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                get lastError() {
                    return runtimeLastError;
                },
            },
            downloads: { download },
        };

        await expect(downloadImage('data:image/png;base64,abc', 'x.png')).rejects.toThrow('Permission denied');
    });

    it('rejects when downloadId is not a number', async () => {
        const download = vi.fn((_options: unknown, callback: (id?: number) => void) => callback(undefined));

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                get lastError() {
                    return runtimeLastError;
                },
            },
            downloads: { download },
        };

        await expect(downloadImage('data:image/png;base64,abc', 'x.png')).rejects.toThrow('Download failed');
    });

    it('copyToClipboard reuses existing offscreen document', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const createDocument = vi.fn();
        const closeDocument = vi.fn().mockResolvedValue(undefined);
        const sendMessage = vi.fn().mockResolvedValue({ success: true });

        vi.useFakeTimers();

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument,
                closeDocument,
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        await expect(copyToClipboard('data:image/png;base64,abc')).resolves.toBeUndefined();

        expect(getContexts).toHaveBeenCalled();
        expect(createDocument).not.toHaveBeenCalled();
        expect(sendMessage).toHaveBeenCalledWith({ action: 'COPY_TO_CLIPBOARD', dataUrl: 'data:image/png;base64,abc' });

        vi.runOnlyPendingTimers();
        expect(closeDocument).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('copyToClipboard creates offscreen document and falls back URL when first create fails', async () => {
        const getContexts = vi.fn().mockResolvedValue([]);
        const createDocument = vi
            .fn()
            .mockRejectedValueOnce(new Error('first create failed'))
            .mockResolvedValueOnce(undefined);
        const closeDocument = vi.fn().mockResolvedValue(undefined);
        const sendMessage = vi.fn().mockResolvedValue({ success: true });

        vi.useFakeTimers();

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument,
                closeDocument,
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        await expect(copyToClipboard('data:image/png;base64,abc')).resolves.toBeUndefined();

        expect(createDocument).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ url: 'offscreen.html', justification: 'Image operations' })
        );
        expect(createDocument).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ url: 'src/offscreen/index.html', justification: 'Image operations' })
        );

        vi.runOnlyPendingTimers();
        expect(closeDocument).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('copyToClipboard rejects when offscreen response fails', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const sendMessage = vi.fn().mockResolvedValue({ success: false, error: 'clipboard failed' });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument: vi.fn(),
                closeDocument: vi.fn(),
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        await expect(copyToClipboard('data:image/png;base64,abc')).rejects.toThrow('clipboard failed');
    });

    it('stitchImages resolves when offscreen returns data', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const sendMessage = vi.fn().mockResolvedValue({ success: true, data: 'data:image/png;base64,stitched' });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument: vi.fn(),
                closeDocument: vi.fn(),
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        const result = await stitchImages([{ dataUrl: 'x', x: 0, y: 0, cssWidth: 10, cssHeight: 10 }], 10, 10, 2);

        expect(result).toBe('data:image/png;base64,stitched');
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'STITCH_IMAGES', totalWidth: 10, totalHeight: 10, dpr: 2 })
        );
    });

    it('stitchImages rejects when response has no data', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const sendMessage = vi.fn().mockResolvedValue({ success: true });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument: vi.fn(),
                closeDocument: vi.fn(),
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        await expect(stitchImages([{ dataUrl: 'x', x: 0, y: 0, cssWidth: 10, cssHeight: 10 }], 10, 10, 2)).rejects.toThrow(
            'Failed to stitch images'
        );
    });

    it('cropImage rejects when offscreen response fails', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const sendMessage = vi.fn().mockResolvedValue({ success: false, error: 'crop failed' });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument: vi.fn(),
                closeDocument: vi.fn(),
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        await expect(
            cropImage(
                'data:image/png;base64,abc',
                { x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 },
                2,
                { innerWidth: 100, innerHeight: 100, scrollX: 0, scrollY: 0 }
            )
        ).rejects.toThrow('crop failed');
    });

    it('cropImage resolves when offscreen returns data', async () => {
        const getContexts = vi.fn().mockResolvedValue([{}]);
        const sendMessage = vi.fn().mockResolvedValue({ success: true, data: 'data:image/png;base64,cropped' });

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                getContexts,
                sendMessage,
                ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
                get lastError() {
                    return runtimeLastError;
                },
            },
            offscreen: {
                createDocument: vi.fn(),
                closeDocument: vi.fn(),
                Reason: { CLIPBOARD: 'CLIPBOARD', WORKERS: 'WORKERS' },
            },
            downloads: { download: vi.fn() },
        };

        const result = await cropImage(
            'data:image/png;base64,abc',
            { x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 },
            2,
            { innerWidth: 100, innerHeight: 100, scrollX: 0, scrollY: 0 }
        );

        expect(result).toBe('data:image/png;base64,cropped');
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CROP_IMAGE',
                dpr: 2,
                viewport: { innerWidth: 100, innerHeight: 100, scrollX: 0, scrollY: 0 },
            })
        );
    });
});
