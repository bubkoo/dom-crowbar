/**
 * Fixed/sticky element hiding during screenshot capture
 *
 * Problem: Elements with position:fixed or position:sticky remain visible
 * during scroll and can cover the target element in screenshots.
 *
 * Solution: Temporarily hide these elements during capture, then restore them.
 * This module handles the hiding and restoration logic.
 */

/**
 * Hide fixed/sticky positioned elements that may cover the target element
 *
 * Strategy:
 * 1. Build a set of the target element's ancestors (these should NOT be hidden)
 * 2. Find all fixed/sticky elements in the document
 * 3. Filter out: ancestors, already hidden elements, very small elements
 * 4. Store original visibility and hide the remaining elements
 *
 * @param tabId - Chrome tab ID
 * @param targetSelector - CSS selector for the target element
 */
export async function hideFixedElements(tabId: number, targetSelector: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (selector: string) => {
      const targetElement = document.querySelector(selector);
      if (!targetElement) return;

      // Build ancestor set - these elements are part of the target's hierarchy
      // and should never be hidden (they might be the fixed element being captured)
      const ancestors = new Set<Element>();
      let current: Element | null = targetElement;
      while (current) {
        ancestors.add(current);
        current = current.parentElement;
      }

      // Scan all elements in the document body
      const allElements = document.body.querySelectorAll('*');

      allElements.forEach((el) => {
        // Skip if element is an ancestor of the target
        if (ancestors.has(el)) return;
        // Skip if element is inside the target subtree
        if (targetElement.contains(el)) return;
        if (!(el instanceof HTMLElement)) return;

        // Skip if already processed (prevents double-hiding)
        if (el.dataset._wasFixed === 'true') return;

        const style = window.getComputedStyle(el);
        const position = style.position;

        // Only process fixed or sticky positioned elements
        if (position !== 'fixed' && position !== 'sticky') return;

        // Skip already invisible elements
        if (style.visibility === 'hidden' || style.display === 'none') return;

        const rect = el.getBoundingClientRect();

        // Skip very small elements (icons, badges, etc. - less than 20x20 pixels)
        const area = rect.width * rect.height;
        if (area < 400) return;

        // Hide all eligible fixed/sticky elements during capture.
        // Intersection checks can miss elements that start overlapping after scroll.
        if (rect.width <= 0 || rect.height <= 0) return;

        // Store original visibility state for restoration
        el.dataset._originalVisibility = el.style.visibility;
        el.dataset._wasFixed = 'true';

        // Hide the element
        el.style.visibility = 'hidden';
      });
    },
    args: [targetSelector],
  });
}

/**
 * Restore all hidden fixed/sticky elements after capture
 *
 * Finds all elements marked with data-_was-fixed="true" and restores
 * their original visibility. Cleans up the temporary data attributes.
 *
 * @param tabId - Chrome tab ID
 */
export async function restoreFixedElements(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Find all elements that were hidden
      const hiddenElements = document.querySelectorAll('[data-_was-fixed="true"]');

      hiddenElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const originalVisibility = htmlEl.dataset._originalVisibility ?? '';

        // Restore original visibility
        // If it was empty, remove the property; otherwise set it back
        if (originalVisibility === '') {
          htmlEl.style.removeProperty('visibility');
        } else {
          htmlEl.style.visibility = originalVisibility;
        }

        // Clean up temporary data attributes
        delete htmlEl.dataset._originalVisibility;
        delete htmlEl.dataset._wasFixed;
      });
    },
  });
}
