import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, loggers } from './logger';

describe('createLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should prefix module name for debug/info/warn/error', () => {
    const log = createLogger('Test');
    log.debug('hello', { a: 1 });
    log.info('world', 123);
    log.warn('warn', true);
    log.error('err', new Error('x'));

    expect(debugSpy).toHaveBeenCalledWith('[Test] hello', { a: 1 });
    expect(infoSpy).toHaveBeenCalledWith('[Test] world', 123);
    expect(warnSpy).toHaveBeenCalledWith('[Test] warn', true);
    expect(errorSpy).toHaveBeenCalledWith('[Test] err', expect.any(Error));
  });

  it('should format trace and result arrows', () => {
    const log = createLogger('Test');
    log.trace('method', { x: 1 });
    log.result('method', { ok: true });

    expect(debugSpy).toHaveBeenCalledWith('[Test] → method', { x: 1 });
    expect(debugSpy).toHaveBeenCalledWith('[Test] ← method', { ok: true });
  });
});

describe('loggers', () => {
  it('should expose common module loggers', () => {
    expect(loggers.background).toBeDefined();
    expect(loggers.content).toBeDefined();
    expect(loggers.overlay).toBeDefined();
    expect(loggers.offscreen).toBeDefined();
  });
});
