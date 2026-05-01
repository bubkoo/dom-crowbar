/**
 * CSS selector builder
 *
 * Generates unique CSS selectors for DOM elements.
 * The generated selectors are used to:
 * 1. Identify elements for screenshot capture
 * 2. Query elements after page scroll
 * 3. Find scrollable parent containers
 *
 * Strategy:
 * 1. Try using ID (most specific)
 * 2. Fall back to tag + class + nth-child
 * 3. Build full path from element to root if needed
 */

/**
 * Build a unique CSS selector for an element
 *
 * Attempts to find the shortest selector that uniquely identifies the element.
 * This is important because:
 * - Shorter selectors are more readable in the UI
 * - Less likely to break if the DOM structure changes slightly
 *
 * @param el - The DOM element to generate a selector for
 * @returns A CSS selector string that uniquely identifies the element
 */
export function buildUniqueSelector(el: Element): string {
  // 1. Try using ID - most specific, usually unique
  if (el.id) {
    const selector = `#${escapeCSSSelector(el.id)}`;
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }

  // 2. Build path from element upward until we find a unique selector
  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    const selector = buildSelectorForElement(current);
    path.unshift(selector);

    // Check if this path is unique
    const fullSelector = path.join(' > ');
    if (isUniqueSelector(fullSelector)) {
      return fullSelector;
    }

    current = current.parentElement;
  }

  // 3. Fallback to full path (might not be unique, but best effort)
  return path.join(' > ');
}

/**
 * Build a selector for a single element
 *
 * Priority:
 * 1. tag#id (if ID exists)
 * 2. tag.class (if meaningful class exists)
 * 3. tag:nth-of-type(n) (positional fallback)
 */
function buildSelectorForElement(el: Element): string {
  const tag = el.tagName.toLowerCase();

  // Use ID if available (prepend tag for specificity)
  if (el.id) {
    return `${tag}#${escapeCSSSelector(el.id)}`;
  }

  // Try using meaningful classes
  const classes = Array.from(el.classList).filter(isMeaningfulClass);
  if (classes.length > 0) {
    // Use up to 2 classes for balance between specificity and readability
    const classSelector = classes.slice(0, 2).map(escapeCSSSelector).join('.');
    const selector = `${tag}.${classSelector}`;

    // Check if unique within parent context
    if (isUniqueSelector(selector, el.parentElement ?? undefined)) {
      return selector;
    }
  }

  // Use nth-of-type as fallback (position among same-tag siblings)
  const nth = getNthOfTypeIndex(el);
  return `${tag}:nth-of-type(${nth})`;
}

/**
 * Get the nth-of-type index for an element
 *
 * Counts how many elements with the same tag name appear before this one,
 * plus 1 (CSS nth-of-type is 1-indexed).
 */
function getNthOfTypeIndex(el: Element): number {
  let index = 1;
  let sibling: Element | null = el.previousElementSibling;

  while (sibling) {
    if (sibling.tagName === el.tagName) {
      index++;
    }
    sibling = sibling.previousElementSibling;
  }

  return index;
}

/**
 * Check if a selector matches exactly one element
 *
 * @param selector - CSS selector to test
 * @param root - Optional context element (defaults to document)
 * @returns true if selector matches exactly one element
 */
function isUniqueSelector(selector: string, root?: Element | Document): boolean {
  const context = root ?? document;
  try {
    const elements = context.querySelectorAll(selector);
    return elements.length === 1;
  } catch {
    // Invalid selector (shouldn't happen with our escaping)
    return false;
  }
}

/**
 * Check if a class name is meaningful
 *
 * Filters out auto-generated classes from frameworks and build tools.
 * These classes are typically:
 * - Not human-readable
 * - May change between builds
 * - Not useful for identification
 */
function isMeaningfulClass(className: string): boolean {
  return (
    // Skip private/internal classes
    !className.startsWith('_') &&
    // Skip JavaScript hook classes
    !className.startsWith('js-') &&
    // Skip CSS Module hashed classes
    !className.startsWith('css-') &&
    // Skip styled-components generated classes
    !className.startsWith('sc-') &&
    // Skip emotion CSS-in-JS classes
    !className.startsWith('emotion-') &&
    // Skip BEM modifiers (block__element--modifier)
    !className.includes('--') &&
    // Skip short hashes like "a1", "bx2", "c3d"
    !className.match(/^[a-z]{1,2}\d+$/) &&
    // Skip very short or very long classes
    className.length > 1 &&
    className.length < 50
  );
}

/**
 * Escape special characters in CSS selectors
 *
 * Converts special characters to their escaped hex representation.
 * For example: "my-id.class" becomes "my-id\\2e class"
 */
function escapeCSSSelector(selector: string): string {
  return selector.replace(/[^\w-]/g, (char) => {
    return `\\${char.charCodeAt(0).toString(16)} `;
  });
}
