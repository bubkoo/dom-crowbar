/**
 * Tests for retry and timeout utilities
 */

import { describe, it, expect } from 'vitest';
import { sleep } from './retry';

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
