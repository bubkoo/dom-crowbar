/**
 * Tests for constants
 */

import { describe, it, expect } from 'vitest';
import { INCOMPATIBLE_URL_PATTERNS } from './constants';

describe('INCOMPATIBLE_URL_PATTERNS', () => {
  it('should match chrome:// URLs', () => {
    expect(INCOMPATIBLE_URL_PATTERNS.CHROME_URL.test('chrome://extensions')).toBe(true);
    expect(INCOMPATIBLE_URL_PATTERNS.CHROME_URL.test('chrome://settings')).toBe(true);
    expect(INCOMPATIBLE_URL_PATTERNS.CHROME_URL.test('https://example.com')).toBe(false);
  });

  it('should match chrome-extension:// URLs', () => {
    expect(INCOMPATIBLE_URL_PATTERNS.CHROME_EXTENSION_URL.test('chrome-extension://abc123/popup.html')).toBe(true);
    expect(INCOMPATIBLE_URL_PATTERNS.CHROME_EXTENSION_URL.test('https://example.com')).toBe(false);
  });

  it('should match file:// URLs', () => {
    expect(INCOMPATIBLE_URL_PATTERNS.FILE_URL.test('file:///Users/test.html')).toBe(true);
    expect(INCOMPATIBLE_URL_PATTERNS.FILE_URL.test('https://example.com')).toBe(false);
  });

  it('should match new tab page', () => {
    expect(INCOMPATIBLE_URL_PATTERNS.NEW_TAB_PAGE.test('chrome://newtab')).toBe(true);
    expect(INCOMPATIBLE_URL_PATTERNS.NEW_TAB_PAGE.test('https://example.com')).toBe(false);
  });
});

