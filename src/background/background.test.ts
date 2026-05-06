import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const copyToClipboardMock = vi.fn();
const downloadImageMock = vi.fn();
const handleNodeSelectedMock = vi.fn();

vi.mock('./offscreen', () => ({
    copyToClipboard: copyToClipboardMock,
    downloadImage: downloadImageMock,
}));

vi.mock('./capture', () => ({
    handleNodeSelected: handleNodeSelectedMock,
}));

describe('background message routing', () => {
    let messageListener: ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean) | undefined;
    let originalChrome: unknown;

    beforeEach(async () => {
        vi.resetModules();

        copyToClipboardMock.mockReset();
        downloadImageMock.mockReset();
        handleNodeSelectedMock.mockReset();

        originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;

        (globalThis as unknown as { chrome: unknown }).chrome = {
            action: { onClicked: { addListener: vi.fn() } },
            tabs: {
                get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com', status: 'complete' }),
                sendMessage: vi.fn().mockResolvedValue(undefined),
            },
            runtime: {
                onMessage: {
                    addListener: vi.fn((listener: typeof messageListener) => {
                        messageListener = listener;
                    }),
                },
            },
        };

        await import('./background');
    });

    afterEach(() => {
        (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
        vi.restoreAllMocks();
    });

    it('routes COPY_TO_CLIPBOARD and responds success', async () => {
        copyToClipboardMock.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        const returned = messageListener?.({ action: 'COPY_TO_CLIPBOARD', dataUrl: 'data:image/png;base64,abc' }, {}, sendResponse);

        expect(returned).toBe(true);
        expect(copyToClipboardMock).toHaveBeenCalledWith('data:image/png;base64,abc');

        await Promise.resolve();
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('routes DOWNLOAD_IMAGE and responds success', async () => {
        downloadImageMock.mockResolvedValue(undefined);

        const sendResponse = vi.fn();
        const returned = messageListener?.({ action: 'DOWNLOAD_IMAGE', dataUrl: 'data:image/png;base64,abc', filename: 'a.png' }, {}, sendResponse);

        expect(returned).toBe(true);
        expect(downloadImageMock).toHaveBeenCalledWith('data:image/png;base64,abc', 'a.png');

        await Promise.resolve();
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('routes NODE_SELECTED through capture handler', async () => {
        handleNodeSelectedMock.mockResolvedValue({ action: 'CAPTURE_SUCCESS', dataUrl: 'x', size: { width: 1, height: 1 }, selector: '#x' });

        const sendResponse = vi.fn();
        const sender = { tab: { id: 7, url: 'https://example.com' } } as chrome.runtime.MessageSender;

        const returned = messageListener?.(
            {
                action: 'NODE_SELECTED',
                selector: '#x',
                rect: { x: 0, y: 0, width: 10, height: 10, top: 0, right: 10, bottom: 10, left: 0 },
                dpr: 2,
                viewport: { innerWidth: 100, innerHeight: 100, scrollX: 0, scrollY: 0 },
            },
            sender,
            sendResponse
        );

        expect(returned).toBe(true);
        expect(handleNodeSelectedMock).toHaveBeenCalledWith(
            7,
            '#x',
            expect.any(Object),
            2,
            expect.any(Object),
            undefined
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ action: 'CAPTURE_SUCCESS' }));
    });

    it('returns CAPTURE_ERROR for unknown action', async () => {
        const sendResponse = vi.fn();

        const returned = messageListener?.({ action: 'UNKNOWN_ACTION' }, {}, sendResponse);

        expect(returned).toBe(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ action: 'CAPTURE_ERROR' }));
    });
});
