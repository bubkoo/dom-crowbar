/**
 * Content script entry point
 *
 * This script is injected into web pages and handles:
 * - Receiving commands from the background service worker
 * - Managing the node selection overlay
 * - Finding scrollable parent containers
 * - Communicating selection results back to background
 */

import { nodeOverlay, screenshotResult } from '.';
import { ContentMessage, BackgroundToContentMessage, DOMRectJson, ViewportInfo, ScrollContainerInfo } from '@shared/types';
import { loggers } from '@shared/logger';
import { buildUniqueSelector } from './selector-builder';

const log = loggers.content;

/** Tracks whether pick mode is currently active */
let isPickMode = false;

/**
 * Listen for messages from the background service worker
 * Handles commands for entering/exiting pick mode and processing capture results
 */
chrome.runtime.onMessage.addListener(
  (message: BackgroundToContentMessage, _sender, sendResponse) => {
    log.trace('message received', { action: message.action });

    switch (message.action) {
      case 'ENTER_PICK_MODE':
        enterPickMode();
        sendResponse({ success: true });
        break;

      case 'EXIT_PICK_MODE':
        exitPickMode();
        sendResponse({ success: true });
        break;

      case 'CAPTURE_SUCCESS':
        log.info('capture success', { width: message.size.width, height: message.size.height });
        screenshotResult.handleSuccess(message.dataUrl, message.size.width, message.size.height, message.selector);
        sendResponse({ success: true });
        break;

      case 'CAPTURE_ERROR':
        log.warn('capture error', { reason: message.reason });
        screenshotResult.showError(message.reason);
        sendResponse({ success: true });
        break;
    }

    // Return true to indicate async response
    return true;
  }
);

/**
 * Activate pick mode for DOM node selection
 * Sets up callbacks for node selection and cancellation
 */
function enterPickMode(): void {
  log.trace('enterPickMode');

  if (isPickMode) {
    log.debug('already in pick mode');
    return;
  }

  isPickMode = true;

  // Set up selection callback - triggered when user clicks or presses Enter
  nodeOverlay.onSelect((selector: string, rect: DOMRectJson) => {
    log.info('node selected', { selector, rect });
    isPickMode = false;

    // Capture current viewport state for scroll restoration
    const viewport: ViewportInfo = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    // Find scrollable parent container for elements inside scrollable areas
    const scrollContainer = findScrollableParent(selector);

    sendMessageToBackground({
      action: 'NODE_SELECTED',
      selector,
      rect,
      dpr: window.devicePixelRatio,
      viewport,
      scrollContainer,
    });
  });

  // Set up cancellation callback - triggered by ESC key
  nodeOverlay.onCancel(() => {
    log.info('pick cancelled');
    isPickMode = false;
    sendMessageToBackground({
      action: 'PICK_CANCELLED',
    });
  });

  nodeOverlay.enter();
  log.info('pick mode activated');
}

/**
 * Deactivate pick mode
 * Called when user cancels selection or after successful capture
 */
function exitPickMode(): void {
  log.trace('exitPickMode');

  if (!isPickMode) return;

  isPickMode = false;
  nodeOverlay.exit();
  log.info('pick mode deactivated');
}

/**
 * Send a message to the background service worker
 */
function sendMessageToBackground(message: ContentMessage): void {
  chrome.runtime.sendMessage(message).catch((error) => {
    log.warn('failed to send message', { error });
  });
}

/**
 * Find the nearest scrollable parent container of an element
 *
 * This is crucial for capturing elements inside scrollable containers (e.g., modals, sidebars).
 * When an element is inside such a container, we need to scroll the container instead of the window.
 *
 * @returns Container info including selector, scroll position, and element's relative position
 */
function findScrollableParent(selector: string): ScrollContainerInfo {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      return { hasScrollableContainer: false };
    }

    let current: Element | null = element.parentElement;

    // Traverse up the DOM tree looking for scrollable ancestors
    while (current && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      // Check if this element has scrollable overflow and content exceeds visible area
      const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight;
      const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth;

      if (isScrollableY || isScrollableX) {
        // Found a scrollable container - build a unique selector for it
        const containerSelector = buildUniqueSelector(current);
        log.info('found scrollable container', { containerSelector, scrollLeft: current.scrollLeft, scrollTop: current.scrollTop });

        // Calculate element's position relative to the container's scrollable content
        // This allows background script to scroll the container to the correct position
        const containerRect = current.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        // Element's position in scroll coordinates = viewport offset + current scroll
        const elementRelativeLeft = elementRect.left - containerRect.left + current.scrollLeft;
        const elementRelativeTop = elementRect.top - containerRect.top + current.scrollTop;

        return {
          hasScrollableContainer: true,
          containerSelector,
          containerScrollLeft: current.scrollLeft,
          containerScrollTop: current.scrollTop,
          elementRelativeLeft,
          elementRelativeTop,
          containerClientWidth: current.clientWidth,
          containerClientHeight: current.clientHeight,
        };
      }

      current = current.parentElement;
    }

    return { hasScrollableContainer: false };
  } catch (error) {
    log.warn('failed to find scrollable parent', { error });
    return { hasScrollableContainer: false };
  }
}

// Clean up when page unloads - exit pick mode to remove overlay
window.addEventListener('beforeunload', () => {
  if (isPickMode) {
    exitPickMode();
  }
});
