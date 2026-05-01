/**
 * Universal logging utility for the extension.
 * Provides module-based logging with different levels.
 */

const isDev = true;

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private formatMessage(message: string): string {
    return `[${this.module}] ${message}`;
  }

  /**
   * Log debug message (dev only)
   */
  debug(message: string, ...args: unknown[]): void {
    if (isDev) {
      console.debug(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log info message (dev only)
   */
  info(message: string, ...args: unknown[]): void {
    if (isDev) {
      console.info(this.formatMessage(message), ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    console.warn(this.formatMessage(message), ...args);
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    console.error(this.formatMessage(message), ...args);
  }

  /**
   * Trace method entry
   */
  trace(method: string, ...args: unknown[]): void {
    if (isDev) {
      console.debug(`[${this.module}] → ${method}`, ...args);
    }
  }

  /**
   * Trace method return
   */
  result(method: string, result?: unknown): void {
    if (isDev) {
      console.debug(`[${this.module}] ← ${method}`, result !== undefined ? result : '');
    }
  }
}

/**
 * Create a logger instance for a specific module
 */
export const createLogger = (module: string): Logger => new Logger(module);

/**
 * Pre-created loggers for common modules
 */
export const loggers = {
  background: createLogger('Background'),
  content: createLogger('Content'),
  overlay: createLogger('Overlay'),
  offscreen: createLogger('Offscreen'),
};
