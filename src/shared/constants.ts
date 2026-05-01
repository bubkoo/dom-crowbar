/**
 * Application constants
 */

// Incompatible URL patterns
export const INCOMPATIBLE_URL_PATTERNS = {
  CHROME_URL: /^chrome:\/\//,
  CHROME_EXTENSION_URL: /^chrome-extension:\/\//,
  FILE_URL: /^file:\/\//,
  ABOUT_URL: /^about:/,
  EDGE_URL: /^edge:\/\//,
  NEW_TAB_PAGE: /^chrome:\/\/newtab/,
} as const;
