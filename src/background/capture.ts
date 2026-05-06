/**
 * Screenshot capture logic
 *
 * Handles three capture scenarios:
 * 1. Simple capture - element is fully visible in viewport
 * 2. Scroll capture - element needs scrolling to become visible
 * 3. Tiled capture - element is larger than viewport, requires multiple captures stitched together
 */

import { BackgroundResponse, BackgroundToContentMessage, DOMRectJson, ScrollContainerInfo, ViewportInfo } from '@shared/types';
import { loggers } from '@shared/logger';
import { sleep } from '@shared/retry';
import { cropImage, stitchImages } from './offscreen';
import { hideFixedElements, restoreFixedElements } from './fixed-elements';

const log = loggers.background;

type ElementViewportInfo = {
  rect: DOMRectJson;
  offsetX: number;
  offsetY: number;
};

type RectExpansion = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Main entry point for handling node selection and screenshot capture
 *
 * Determines the appropriate capture strategy based on element size and visibility,
 * executes the capture, and returns the result.
 */
export async function handleNodeSelected(
  tabId: number,
  selector: string,
  rect: DOMRectJson,
  dpr: number,
  viewport: ViewportInfo,
  scrollContainer?: ScrollContainerInfo
): Promise<BackgroundResponse> {
  log.trace('handleNodeSelected', { tabId, selector, rect, dpr, viewport, scrollContainer });

  if (!tabId) {
    return { action: 'CAPTURE_ERROR', reason: 'Invalid page tab' };
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    log.debug('tab status', { status: tab.status, url: tab.url, windowId: tab.windowId });

    // Ensure page is fully loaded before capturing
    if (tab.status !== 'complete') {
      return { action: 'CAPTURE_ERROR', reason: 'Page is still loading, please wait' };
    }

    // Store original scroll position for restoration after capture
    const originalScrollX = viewport.scrollX;
    const originalScrollY = viewport.scrollY;

    // Compute how much the user expanded/shrank around the selected node.
    // This keeps +/- adjustments effective across scroll/tiled capture paths.
    const expansion = await getRectExpansion(tabId, selector, rect);

    // Determine capture strategy.
    //
    // Why we need an "effective viewport":
    // - For normal pages, what can be captured in one shot is bounded by window viewport.
    // - For elements inside a scrollable container, what can be captured per step is bounded by
    //   the container's visible box, not the full window.
    //
    // This value is only used for deciding between single-shot vs tiled capture.
    const effectiveViewportWidth = scrollContainer?.hasScrollableContainer
      ? (scrollContainer.containerClientWidth || viewport.innerWidth)
      : viewport.innerWidth;
    const effectiveViewportHeight = scrollContainer?.hasScrollableContainer
      ? (scrollContainer.containerClientHeight || viewport.innerHeight)
      : viewport.innerHeight;

    // Visibility is checked in two coordinate spaces:
    // 1) window viewport visibility (classic case)
    // 2) container viewport visibility (nested scroll container case)
    //
    // We only treat as "fully visible" when both are true.
    const fullyVisibleInViewport = isRectFullyVisible(rect, viewport);
    const fullyVisibleInContainer = isRectFullyVisibleInContainer(rect, scrollContainer);

    // needsScrolling:
    // - The target isn't fully visible in current frame, so we must move viewport/container.
    // needsTiling:
    // - The target is larger than a single effective viewport and must be stitched from tiles.
    const needsScrolling = !(fullyVisibleInViewport && fullyVisibleInContainer);
    const needsTiling = rect.width > effectiveViewportWidth || rect.height > effectiveViewportHeight;

    // Hiding fixed/sticky elements can alter page rendering; keep it scoped to scenarios where
    // scrolling/tiling happens and overlapping artifacts are more likely.
    const shouldHideFixedElements = needsScrolling || needsTiling;

    let croppedDataUrl: string;

    try {
      // Only hide fixed/sticky elements for scroll/tiled capture.
      // Simple capture avoids this to reduce page side effects.
      if (shouldHideFixedElements) {
        await hideFixedElements(tabId, selector);
      }

      if (needsTiling) {
        // Element is larger than viewport - use tiled capture
        log.info('element larger than viewport, using tiled capture');
        croppedDataUrl = await captureTiledScreenshot(
          tabId,
          selector,
          tab.windowId,
          rect,
          expansion,
          dpr,
          viewport,
          originalScrollX,
          originalScrollY,
          scrollContainer
        );
      } else if (needsScrolling) {
        // Element is not fully visible - scroll then capture
        log.info('element not fully visible, scrolling');
        croppedDataUrl = await captureWithScroll(
          tabId,
          selector,
          tab.windowId,
          rect,
          expansion,
          dpr,
          viewport,
          originalScrollX,
          originalScrollY,
          scrollContainer
        );
      } else {
        // Simple case - element is fully visible
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        if (!dataUrl) {
          throw new Error('Failed to capture screenshot');
        }
        croppedDataUrl = await cropImage(dataUrl, rect, dpr, viewport);
      }
    } finally {
      // Restore only when we actually performed fixed/sticky hiding.
      if (shouldHideFixedElements) {
        await restoreFixedElements(tabId);
      }
    }

    // Notify content script of success (for UI feedback)
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'CAPTURE_SUCCESS',
        dataUrl: croppedDataUrl,
        size: { width: rect.width, height: rect.height },
        selector,
      } as BackgroundToContentMessage);
    } catch {
      // Ignore errors - content script might not be listening
    }

    return {
      action: 'CAPTURE_SUCCESS',
      dataUrl: croppedDataUrl,
      size: { width: rect.width, height: rect.height },
      selector,
    };
  } catch (error) {
    log.error('capture failed', error);
    return {
      action: 'CAPTURE_ERROR',
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if the element's rect is fully visible within the viewport
 */
function isRectFullyVisible(rect: DOMRectJson, viewport: ViewportInfo): boolean {
  return (
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= viewport.innerWidth &&
    rect.bottom <= viewport.innerHeight
  );
}

/**
 * Check whether an element is fully visible within its scrollable container.
 * If there is no container info, treat it as visible to avoid blocking normal viewport logic.
 */
function isRectFullyVisibleInContainer(
  rect: DOMRectJson,
  scrollContainer?: ScrollContainerInfo
): boolean {
  if (!scrollContainer?.hasScrollableContainer) {
    return true;
  }

  const elementRelativeLeft = scrollContainer.elementRelativeLeft;
  const elementRelativeTop = scrollContainer.elementRelativeTop;
  const containerScrollLeft = scrollContainer.containerScrollLeft;
  const containerScrollTop = scrollContainer.containerScrollTop;
  const containerClientWidth = scrollContainer.containerClientWidth;
  const containerClientHeight = scrollContainer.containerClientHeight;

  if (
    typeof elementRelativeLeft !== 'number' ||
    typeof elementRelativeTop !== 'number' ||
    typeof containerScrollLeft !== 'number' ||
    typeof containerScrollTop !== 'number' ||
    typeof containerClientWidth !== 'number' ||
    typeof containerClientHeight !== 'number'
  ) {
    // Missing container geometry: force scroll/capture path instead of simple capture.
    return false;
  }

  const visibleLeft = containerScrollLeft;
  const visibleTop = containerScrollTop;
  const visibleRight = containerScrollLeft + containerClientWidth;
  const visibleBottom = containerScrollTop + containerClientHeight;

  const elementRight = elementRelativeLeft + rect.width;
  const elementBottom = elementRelativeTop + rect.height;

  return (
    elementRelativeLeft >= visibleLeft &&
    elementRelativeTop >= visibleTop &&
    elementRight <= visibleRight &&
    elementBottom <= visibleBottom
  );
}

/**
 * Capture an element that fits in viewport but needs scrolling
 *
 * Strategy:
 * 1. Calculate scroll position to center the element
 * 2. Scroll to that position (container or window)
 * 3. Capture the viewport
 * 4. Query the element's actual position after scroll
 * 5. Crop to the element
 * 6. Restore original scroll position
 */
async function captureWithScroll(
  tabId: number,
  selector: string,
  windowId: number,
  rect: DOMRectJson,
  expansion: RectExpansion,
  dpr: number,
  viewport: ViewportInfo,
  originalScrollX: number,
  originalScrollY: number,
  scrollContainer?: ScrollContainerInfo
): Promise<string> {
  let targetScrollX: number;
  let targetScrollY: number;

  if (scrollContainer?.hasScrollableContainer && scrollContainer.containerSelector) {
    // Scroll the container to center the element within it
    const containerWidth = scrollContainer.containerClientWidth || viewport.innerWidth;
    const containerHeight = scrollContainer.containerClientHeight || viewport.innerHeight;

    // elementRelativeLeft/Top are in container scroll coordinates.
    // We center by aligning element midpoint with container midpoint where possible.
    targetScrollX = Math.max(0, Math.floor((scrollContainer.elementRelativeLeft || 0) - (containerWidth - rect.width) / 2));
    targetScrollY = Math.max(0, Math.floor((scrollContainer.elementRelativeTop || 0) - (containerHeight - rect.height) / 2));
  } else {
    // Scroll the window to center the element
    const elementAbsLeft = rect.left + originalScrollX;
    const elementAbsTop = rect.top + originalScrollY;

    // rect is viewport-relative at selection time; convert to document coordinates first.
    targetScrollX = Math.max(0, Math.floor(elementAbsLeft - (viewport.innerWidth - rect.width) / 2));
    targetScrollY = Math.max(0, Math.floor(elementAbsTop - (viewport.innerHeight - rect.height) / 2));
  }

  // Perform the scroll
  await scrollToPosition(tabId, targetScrollX, targetScrollY, scrollContainer);
  await sleep(200); // Wait for scroll to complete and render

  // Query the element's actual position in the viewport after scroll
  const elementViewportInfo = await getElementRectAfterScroll(
    tabId,
    selector,
    scrollContainer,
    rect,
    expansion,
    targetScrollX,
    targetScrollY
  );

  // Capture the visible viewport
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  if (!dataUrl) {
    await restoreScroll(tabId, originalScrollX, originalScrollY, scrollContainer);
    throw new Error('Failed to capture screenshot');
  }

  // Crop to the element's visible portion
  const croppedDataUrl = await cropImage(dataUrl, elementViewportInfo.rect, dpr, viewport);

  // Restore original scroll position
  await restoreScroll(tabId, originalScrollX, originalScrollY, scrollContainer);

  return croppedDataUrl;
}

/**
 * Restore scroll position after capture
 * For containers: restore to container's original scroll position
 * For window: restore to original window scroll position
 */
async function restoreScroll(
  tabId: number,
  scrollX: number,
  scrollY: number,
  scrollContainer?: ScrollContainerInfo
): Promise<void> {
  try {
    if (scrollContainer?.hasScrollableContainer && scrollContainer.containerSelector) {
      // Restore container scroll to its original position
      await scrollToPosition(
        tabId,
        scrollContainer.containerScrollLeft || 0,
        scrollContainer.containerScrollTop || 0,
        scrollContainer
      );
    } else {
      // Restore window scroll
      await scrollToPosition(tabId, scrollX, scrollY, scrollContainer);
    }
  } catch {
    // Ignore errors during restoration
  }
}

/**
 * Scroll to a specific position
 * Handles both window scrolling and container scrolling
 */
async function scrollToPosition(
  tabId: number,
  scrollX: number,
  scrollY: number,
  scrollContainer?: ScrollContainerInfo
): Promise<void> {
  if (scrollContainer?.hasScrollableContainer && scrollContainer.containerSelector) {
    // Scroll the container element
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (selector: string, x: number, y: number) => {
        const container = document.querySelector(selector);
        if (container) {
          container.scrollLeft = x;
          container.scrollTop = y;
        }
      },
      args: [scrollContainer.containerSelector, scrollX, scrollY],
    });
  } else {
    // Scroll the window
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (x: number, y: number) => window.scrollTo(x, y),
      args: [scrollX, scrollY],
    });
  }
}

/**
 * Capture an element larger than viewport using tiles
 *
 * Strategy:
 * 1. Calculate grid dimensions (cols × rows)
 * 2. For each tile:
 *    - Scroll to tile position
 *    - Capture viewport
 *    - Query element's actual position and crop
 * 3. Stitch all tiles together
 * 4. Restore original scroll position
 *
 * Note: 350ms delay between captures to avoid Chrome API quota limits (~10 calls/second)
 */
async function captureTiledScreenshot(
  tabId: number,
  selector: string,
  windowId: number,
  rect: DOMRectJson,
  expansion: RectExpansion,
  dpr: number,
  viewport: ViewportInfo,
  originalScrollX: number,
  originalScrollY: number,
  scrollContainer?: ScrollContainerInfo
): Promise<string> {
  const viewportWidth = viewport.innerWidth;
  const viewportHeight = viewport.innerHeight;

  // Determine the effective capture area (container vs viewport)
  let effectiveWidth: number;
  let effectiveHeight: number;

  if (scrollContainer?.hasScrollableContainer && scrollContainer.containerSelector) {
    // Use container's visible area as tile size
    effectiveWidth = scrollContainer.containerClientWidth || viewportWidth;
    effectiveHeight = scrollContainer.containerClientHeight || viewportHeight;
  } else {
    // Use viewport as tile size
    effectiveWidth = viewportWidth;
    effectiveHeight = viewportHeight;
  }

  // Calculate tile grid dimensions.
  // Each tile represents one capture step of the target area within the effective viewport.
  const cols = Math.ceil(rect.width / effectiveWidth);
  const rows = Math.ceil(rect.height / effectiveHeight);

  const tiles: { dataUrl: string; x: number; y: number; cssWidth: number; cssHeight: number }[] = [];

  try {
    // Capture each tile in the grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Calculate scroll position for this tile
        let scrollX: number;
        let scrollY: number;

        if (scrollContainer?.hasScrollableContainer && scrollContainer.containerSelector) {
          // Scroll container to show this tile of the element
          // elementRelativeLeft/Top are absolute in container scroll space, so tile offsets are additive.
          scrollX = Math.floor((scrollContainer.elementRelativeLeft || 0) + col * effectiveWidth);
          scrollY = Math.floor((scrollContainer.elementRelativeTop || 0) + row * effectiveHeight);
        } else {
          // Scroll window to show this tile
          // rect.left/top are viewport-relative at selection time; convert by adding original scroll.
          scrollX = Math.floor(rect.left + originalScrollX + col * effectiveWidth);
          scrollY = Math.floor(rect.top + originalScrollY + row * effectiveHeight);
        }

        // Scroll and wait for render
        await scrollToPosition(tabId, scrollX, scrollY, scrollContainer);
        await sleep(250);

        // Capture the viewport
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        if (!dataUrl) {
          throw new Error('Failed to capture screenshot');
        }

        // Query element's position and get the visible portion
        const elementViewportInfo = await getElementRectAfterScroll(
          tabId,
          selector,
          scrollContainer,
          rect,
          expansion,
          scrollX,
          scrollY
        );
        const elementViewportRect = elementViewportInfo.rect;

        // Crop to the element's visible portion
        const croppedTile = await cropImage(dataUrl, elementViewportRect, dpr, viewport);

        // Store tile with its position in the final stitched image.
        // offsetX/offsetY are offsets inside the target box (not document coords), which lets the
        // stitcher place each cropped tile correctly in target-local space.
        tiles.push({
          dataUrl: croppedTile,
          x: elementViewportInfo.offsetX,
          y: elementViewportInfo.offsetY,
          cssWidth: elementViewportRect.width,
          cssHeight: elementViewportRect.height,
        });

        // Delay to avoid Chrome API quota limits
        await sleep(350);
      }
    }

    // Stitch all tiles into final image
    const result = await stitchImages(tiles, rect.width, rect.height, dpr);
    await restoreScroll(tabId, originalScrollX, originalScrollY, scrollContainer);
    return result;
  } catch (error) {
    // Always restore scroll on error
    await restoreScroll(tabId, originalScrollX, originalScrollY, scrollContainer);
    throw error;
  }
}

/**
 * Query the element's actual viewport position after scrolling
 *
 * This is necessary because:
 * 1. The element might be partially outside the viewport
 * 2. We need the exact pixel coordinates for cropping
 * 3. Scroll positions might not be exact due to scroll boundaries
 */
async function getElementRectAfterScroll(
  tabId: number,
  elementSelector: string,
  scrollContainer: ScrollContainerInfo | undefined,
  selectedRect: DOMRectJson,
  expansion: RectExpansion,
  _targetScrollX: number,
  _targetScrollY: number
): Promise<ElementViewportInfo> {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (selector: string, containerSelector: string | null, expand: RectExpansion) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }

      const elementRect = element.getBoundingClientRect();
      // Rebuild the user-intended capture box by expanding around the live element rect.
      // This keeps +/- adjustments effective even after scrolling changes viewport position.
      const expandedLeft = elementRect.left - expand.left;
      const expandedTop = elementRect.top - expand.top;
      const expandedRight = elementRect.right + expand.right;
      const expandedBottom = elementRect.bottom + expand.bottom;

      const container = containerSelector ? document.querySelector(containerSelector) : null;

      const viewportLeft = 0;
      const viewportTop = 0;
      const viewportRight = window.innerWidth;
      const viewportBottom = window.innerHeight;

      let clipLeft = viewportLeft;
      let clipTop = viewportTop;
      let clipRight = viewportRight;
      let clipBottom = viewportBottom;

      if (container instanceof Element) {
        const containerRect = container.getBoundingClientRect();
        clipLeft = Math.max(clipLeft, containerRect.left);
        clipTop = Math.max(clipTop, containerRect.top);
        clipRight = Math.min(clipRight, containerRect.right);
        clipBottom = Math.min(clipBottom, containerRect.bottom);
      }

      const visibleLeft = Math.max(clipLeft, expandedLeft);
      const visibleTop = Math.max(clipTop, expandedTop);
      const visibleRight = Math.min(clipRight, expandedRight);
      const visibleBottom = Math.min(clipBottom, expandedBottom);

      const width = Math.max(0, visibleRight - visibleLeft);
      const height = Math.max(0, visibleBottom - visibleTop);
      if (width <= 0 || height <= 0) {
        return null;
      }

      return {
        rect: {
          x: visibleLeft,
          y: visibleTop,
          width,
          height,
          left: visibleLeft,
          top: visibleTop,
          right: visibleRight,
          bottom: visibleBottom,
        },
        offsetX: visibleLeft - expandedLeft,
        offsetY: visibleTop - expandedTop,
      };
    },
    args: [
      elementSelector,
      scrollContainer?.hasScrollableContainer ? (scrollContainer.containerSelector ?? null) : null,
      expansion,
    ],
  });

  const info = result[0]?.result;
  if (info) {
    return info;
  }

  // Fallback path:
  // - Keeps flow alive in pages where selector becomes temporarily unavailable during scroll/reflow.
  // - May produce imperfect stitching for highly dynamic pages; callers should treat frequent hits
  //   on this branch as a signal that selector stability needs improvement.
  log.warn('element not found after scroll, using original rect');
  return { rect: selectedRect, offsetX: 0, offsetY: 0 };
}

async function getRectExpansion(
  tabId: number,
  selector: string,
  selectedRect: DOMRectJson
): Promise<RectExpansion> {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (nodeSelector: string) => {
      const element = document.querySelector(nodeSelector);
      if (!element) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    },
    args: [selector],
  });

  const elementRect = result[0]?.result;
  if (!elementRect) {
    // If the node cannot be re-queried (rare reflow/race), treat as no expansion.
    // Downstream still has selectedRect as fallback.
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  // Expansion is measured as selected-box minus live element box on each side.
  // Positive numbers mean the user expanded outward; negatives are clamped to 0.
  return {
    top: Math.max(0, Math.round(elementRect.top - selectedRect.top)),
    right: Math.max(0, Math.round(selectedRect.right - elementRect.right)),
    bottom: Math.max(0, Math.round(selectedRect.bottom - elementRect.bottom)),
    left: Math.max(0, Math.round(elementRect.left - selectedRect.left)),
  };
}

