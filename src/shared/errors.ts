/**
 * Custom error types for the extension
 */

class DomnodeCrowbarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomnodeCrowbarError';
  }
}

/**
 * Thrown when trying to screenshot an incompatible page
 */
export class IncompatiblePageError extends DomnodeCrowbarError {
  constructor(reason: string) {
    super(`Incompatible page: ${reason}`);
    this.name = 'IncompatiblePageError';
  }
}

