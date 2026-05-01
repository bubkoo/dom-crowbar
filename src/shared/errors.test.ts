/**
 * Tests for custom error types
 */

import { describe, it, expect } from 'vitest';
import {
  IncompatiblePageError,
} from './errors';

describe('Error classes', () => {
  describe('IncompatiblePageError', () => {
    it('should create error with reason', () => {
      const error = new IncompatiblePageError('chrome:// URL');
      expect(error.message).toContain('chrome:// URL');
      expect(error.message).toContain('Incompatible');
      expect(error.name).toBe('IncompatiblePageError');
    });
  });
});
