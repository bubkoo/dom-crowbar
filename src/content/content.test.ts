import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { overlayMock, screenshotMock, buildUniqueSelectorMock } = vi.hoisted(() => {
    const state = {
        onSelectCallback: undefined as ((selector: string, rect: chrome.windows.ImageDetails) => void) | undefined,
        onCancelCallback: undefined as (() => void) | undefined,
    };

    return {
        overlayMock: {
            enter: vi.fn(),
            exit: vi.fn(),
            onSelect: vi.fn((cb: (selector: string, rect: chrome.windows.ImageDetails) => void) => {
                state.onSelectCallback = cb;
            }),
            onCancel: vi.fn((cb: () => void) => {
                state.onCancelCallback = cb;
            }),
            __state: state,
        },
        screenshotMock: {
            handleSuccess: vi.fn(),
            showError: vi.fn(),
        },
        buildUniqueSelectorMock: vi.fn(() => '.scroll-parent'),
    };
});

vi.mock('./', () => ({
    nodeOverlay: overlayMock,
    screenshotResult: screenshotMock,
}));

vi.mock('./selector-builder', () => ({
    buildUniqueSelector: buildUniqueSelectorMock,
}));

describe('content script routing', () => {
    let messageListener:
        | ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => boolean)
        | undefined;
    let originalChrome: unknown;

    beforeEach(async () => {
        vi.resetModules();
        document.body.innerHTML = '';

        overlayMock.enter.mockReset();
        overlayMock.exit.mockReset();
        overlayMock.onSelect.mockReset();
        overlayMock.onCancel.mockReset();
        overlayMock.__state.onSelectCallback = undefined;
        overlayMock.__state.onCancelCallback = undefined;

        screenshotMock.handleSuccess.mockReset();
        screenshotMock.showError.mockReset();
        buildUniqueSelectorMock.mockReset();
        buildUniqueSelectorMock.mockReturnValue('.scroll-parent');

        originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;

        (globalThis as unknown as { chrome: unknown }).chrome = {
            runtime: {
                onMessage: {
                    addListener: vi.fn((listener: typeof messageListener) => {
                        messageListener = listener;
                    }),
                },
                sendMessage: vi.fn().mockResolvedValue(undefined),
            },
        };

        await import('./content');
    });

    afterEach(() => {
        (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
        vi.restoreAllMocks();
    });

    it('handles CAPTURE_SUCCESS and CAPTURE_ERROR messages', () => {
        const sendResponse = vi.fn();

        const successReturned = messageListener?.(
            { action: 'CAPTURE_SUCCESS', dataUrl: 'data:image/png;base64,a', size: { width: 10, height: 20 }, selector: '#node' },
            {},
            sendResponse
        );

        expect(successReturned).toBe(true);
        expect(screenshotMock.handleSuccess).toHaveBeenCalledWith('data:image/png;base64,a', 10, 20, '#node');

        const errorReturned = messageListener?.({ action: 'CAPTURE_ERROR', reason: 'capture failed' }, {}, sendResponse);

        expect(errorReturned).toBe(true);
        expect(screenshotMock.showError).toHaveBeenCalledWith('capture failed');
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('enters pick mode and sends NODE_SELECTED without scroll container', () => {
        const sendResponse = vi.fn();
        const sendMessage = (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;

        const returned = messageListener?.({ action: 'ENTER_PICK_MODE' }, {}, sendResponse);
        expect(returned).toBe(true);
        expect(overlayMock.enter).toHaveBeenCalledTimes(1);

        const selectCb = overlayMock.__state.onSelectCallback;
        expect(selectCb).toBeDefined();

        selectCb?.('#missing', {
            x: 1,
            y: 2,
            width: 30,
            height: 40,
            top: 2,
            right: 31,
            bottom: 42,
            left: 1,
        });

        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'NODE_SELECTED',
                selector: '#missing',
                rect: expect.objectContaining({ width: 30, height: 40 }),
                scrollContainer: { hasScrollableContainer: false },
            })
        );
    });

    it('detects scrollable parent and includes scrollContainer metadata', () => {
        const sendResponse = vi.fn();
        const sendMessage = (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;

        const scrollParent = document.createElement('div');
        scrollParent.className = 'scroll-parent';
        const target = document.createElement('div');
        target.id = 'target-node';
        scrollParent.appendChild(target);
        document.body.appendChild(scrollParent);

        Object.defineProperty(scrollParent, 'scrollHeight', { configurable: true, value: 1200 });
        Object.defineProperty(scrollParent, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(scrollParent, 'scrollWidth', { configurable: true, value: 1000 });
        Object.defineProperty(scrollParent, 'clientWidth', { configurable: true, value: 400 });
        scrollParent.scrollLeft = 15;
        scrollParent.scrollTop = 80;

        vi.spyOn(window, 'getComputedStyle').mockImplementation((node: Element) => {
            if (node === scrollParent) {
                return { overflowY: 'auto', overflowX: 'hidden' } as CSSStyleDeclaration;
            }
            return { overflowY: 'visible', overflowX: 'visible' } as CSSStyleDeclaration;
        });

        vi.spyOn(scrollParent, 'getBoundingClientRect').mockReturnValue({
            x: 100,
            y: 200,
            width: 400,
            height: 300,
            top: 200,
            right: 500,
            bottom: 500,
            left: 100,
            toJSON: () => ({}),
        });

        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
            x: 150,
            y: 260,
            width: 120,
            height: 90,
            top: 260,
            right: 270,
            bottom: 350,
            left: 150,
            toJSON: () => ({}),
        });

        messageListener?.({ action: 'ENTER_PICK_MODE' }, {}, sendResponse);

        const selectCb = overlayMock.__state.onSelectCallback;
        selectCb?.('#target-node', {
            x: 150,
            y: 260,
            width: 120,
            height: 90,
            top: 260,
            right: 270,
            bottom: 350,
            left: 150,
        });

        expect(buildUniqueSelectorMock).toHaveBeenCalledWith(scrollParent);
        expect(sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'NODE_SELECTED',
                scrollContainer: {
                    hasScrollableContainer: true,
                    containerSelector: '.scroll-parent',
                    containerScrollLeft: 15,
                    containerScrollTop: 80,
                    elementRelativeLeft: 65,
                    elementRelativeTop: 140,
                    containerClientWidth: 400,
                    containerClientHeight: 300,
                },
            })
        );
    });

    it('sends PICK_CANCELLED on cancel callback', () => {
        const sendResponse = vi.fn();
        const sendMessage = (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;

        messageListener?.({ action: 'ENTER_PICK_MODE' }, {}, sendResponse);
        const cancelCb = overlayMock.__state.onCancelCallback;

        expect(cancelCb).toBeDefined();
        cancelCb?.();

        expect(sendMessage).toHaveBeenCalledWith({ action: 'PICK_CANCELLED' });
    });

    it('exits pick mode on EXIT_PICK_MODE and avoids duplicate enter', () => {
        const sendResponse = vi.fn();

        messageListener?.({ action: 'ENTER_PICK_MODE' }, {}, sendResponse);
        messageListener?.({ action: 'ENTER_PICK_MODE' }, {}, sendResponse);

        expect(overlayMock.enter).toHaveBeenCalledTimes(1);

        messageListener?.({ action: 'EXIT_PICK_MODE' }, {}, sendResponse);
        expect(overlayMock.exit).toHaveBeenCalledTimes(1);
    });
});
