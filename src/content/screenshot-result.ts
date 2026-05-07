/**
 * Screenshot result handler
 *
 * Handles the post-capture workflow:
 * 1. Copy screenshot to clipboard
 * 2. Download screenshot to disk
 * 3. Show success/error toast notifications
 *
 * This runs in the content script context, which has access to the DOM
 * for showing toast notifications, but delegates clipboard/download operations
 * to the background script via message passing.
 */

import { loggers } from '@shared/logger';
import { t } from '@shared/i18n';

const log = loggers.overlay;

type OperationResult = {
  success: boolean;
  error?: string;
};

const defaultToastDurationMs = 3000;
const manualCopyToastDurationMs = 6000;

class ScreenshotResult {
  /**
   * Handle successful screenshot capture
   *
    * Performs three actions in sequence:
   * 1. Copy image to clipboard
   * 2. Download image to disk
   * 3. Show success toast
   */
  async handleSuccess(dataUrl: string, width: number, height: number, selector: string): Promise<void> {
    log.info('handling screenshot success', { width, height, selector });

    const filename = this.generateFilename();

    // Copy first to reduce focus-related clipboard failures caused by download side-effects.
    const copyResult = await this.copyToClipboard(dataUrl);
    const downloadResult = await this.download(dataUrl, filename);

    const copied = copyResult.success;
    const downloaded = downloadResult.success;

    if (copied || downloaded) {
      this.showSuccessToast(width, height, copied, downloaded, dataUrl, copyResult.error);
      log.info('screenshot processed', {
        copied,
        downloaded,
        copyError: copyResult.error,
        downloadError: downloadResult.error,
      });
      return;
    }

    this.showErrorToast(t('screenshotToastCopyAndDownloadFailed'));
    log.warn('screenshot processing failed', {
      copied,
      downloaded,
      copyError: copyResult.error,
      downloadError: downloadResult.error,
    });
  }

  /**
   * Generate filename with timestamp
   * Format: dom-crowbar-{timestamp}.png
   */
  private generateFilename(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
    return `dom-crowbar-${timestamp}.png`;
  }

  /**
   * Handle screenshot error
   * Shows an error toast with the error message
   */
  showError(message: string): void {
    log.error('screenshot error', { message });
    this.showErrorToast(message);
  }

  /**
   * Show success toast notification
   */
  private showSuccessToast(
    width: number,
    height: number,
    copied: boolean,
    downloaded: boolean,
    dataUrl: string,
    copyError?: string
  ): void {
    const roundedWidth = Math.round(width);
    const roundedHeight = Math.round(height);

    let statusText = t('screenshotStatusCopiedAndDownloaded');
    if (copied && !downloaded) statusText = t('screenshotStatusCopied');
    if (!copied && downloaded) {
      statusText = t('screenshotStatusDownloaded');
    }

    const showManualCopyButton = !copied;

    if (showManualCopyButton && copyError) {
      log.warn('auto copy failed, showing manual copy button', {
        error: copyError,
        summarized: this.summarizeError(copyError),
      });
    }

    this.showToast('success', `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      <span style="flex: 1;">${this.escapeHtml(t('screenshotToastCaptured'))}</span>
      <span style="opacity: 0.85; font-size: 11px;">${this.escapeHtml(statusText)}</span>
      <span style="opacity: 0.7; font-size: 11px;">${roundedWidth} × ${roundedHeight}</span>
      ${showManualCopyButton
        ? `<button id="dom-crowbar-copy-btn" style="margin-left: 6px; width: 68px; box-sizing: border-box; text-align: center; white-space: nowrap; border: 1px solid rgba(255,255,255,0.35); background: rgba(255,255,255,0.15); color: #fff; border-radius: 6px; padding: 4px 8px; font-size: 11px; cursor: pointer;">${this.escapeHtml(t('screenshotCopyButtonCopy'))}</button>`
        : ''}
    `, {
      durationMs: showManualCopyButton ? manualCopyToastDurationMs : defaultToastDurationMs,
      onMount: showManualCopyButton
        ? (toast) => {
          const button = toast.querySelector('#dom-crowbar-copy-btn') as HTMLButtonElement | null;
          if (!button) return;

          button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = t('screenshotCopyButtonCopying');

            try {
              await this.manualCopyFromUserGesture(dataUrl);
              button.textContent = t('screenshotCopyButtonCopied');
              log.info('manual copy succeeded');
            } catch (error) {
              button.textContent = t('screenshotCopyButtonRetry');
              button.disabled = false;
              log.warn('manual copy failed', {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });
        }
        : undefined,
    });
  }

  /**
   * Keep status line compact while preserving useful diagnostics.
   */
  private summarizeError(message: string): string {
    const trimmed = message.trim();

    if (/document is not focused/i.test(trimmed)) {
      return 'document not focused';
    }

    if (/notallowederror|write permission denied|permission denied/i.test(trimmed)) {
      return 'permission denied';
    }

    if (/clipboard/i.test(trimmed) && /failed to execute|write/i.test(trimmed)) {
      return 'clipboard write blocked';
    }

    if (trimmed.length <= 48) return trimmed;
    return `${trimmed.slice(0, 48)}...`;
  }

  /**
   * Show error toast notification
   */
  private showErrorToast(message: string): void {
    this.showToast('error', `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <span style="flex: 1;">${this.escapeHtml(message)}</span>
    `);
  }

  /**
   * Show a toast notification
   *
   * Uses fixed positioning with maximum z-index to appear above all page content.
   * Toast auto-dismisses after 3 seconds with a fade-out animation.
   */
  private showToast(
    type: 'success' | 'error',
    content: string,
    options?: {
      durationMs?: number;
      onMount?: (toast: HTMLDivElement) => void;
    }
  ): void {
    // Remove existing toast to prevent stacking
    const existing = document.getElementById('dom-crowbar-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'dom-crowbar-toast';

    // Green gradient for success, red for error
    const bgColor = type === 'success'
      ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(16, 185, 129, 0.95) 100%)'
      : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)';

    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: ${bgColor};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: dom-crowbar-toast-in 0.3s ease-out;
      backdrop-filter: blur(10px);
    `;

    // Add animation keyframes (only once)
    if (!document.getElementById('dom-crowbar-toast-style')) {
      const style = document.createElement('style');
      style.id = 'dom-crowbar-toast-style';
      style.textContent = `
        @keyframes dom-crowbar-toast-in {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes dom-crowbar-toast-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
        }
      `;
      document.head.appendChild(style);
    }

    toast.innerHTML = content;
    document.body.appendChild(toast);

    options?.onMount?.(toast);

    // Auto remove after a short delay with fade-out animation
    const durationMs = options?.durationMs ?? defaultToastDurationMs;
    setTimeout(() => {
      toast.style.animation = 'dom-crowbar-toast-out 0.25s ease-in forwards';
      setTimeout(() => toast.remove(), 250);
    }, durationMs);
  }

  /**
   * Escape HTML entities to prevent XSS in toast messages
   */
  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Copy image to clipboard via background script
   *
   * The background script forwards this to the offscreen document,
   * which has access to the Clipboard API.
   */
  private async copyToClipboard(dataUrl: string): Promise<OperationResult> {
    try {
      await this.requestCopy(dataUrl);

      log.debug('copied to clipboard');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('copy failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  private async requestCopy(dataUrl: string): Promise<void> {
    const response = await chrome.runtime.sendMessage({
      action: 'COPY_TO_CLIPBOARD',
      dataUrl,
    });

    if (!response || typeof response !== 'object' || !('success' in response) || response.success !== true) {
      const errorMessage =
        response && typeof response === 'object' && 'error' in response && typeof response.error === 'string'
          ? response.error
          : 'Copy failed';
      throw new Error(errorMessage);
    }
  }

  /**
   * Manual copy path triggered from toast button click (user gesture).
   * Prefer direct clipboard write in page context, then fallback to background route.
   */
  private async manualCopyFromUserGesture(dataUrl: string): Promise<void> {
    try {
      await this.tryDirectClipboardWrite(dataUrl);
      return;
    } catch (error) {
      log.warn('direct manual copy failed, falling back to background copy', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await this.requestCopy(dataUrl);
  }

  private async tryDirectClipboardWrite(dataUrl: string): Promise<void> {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      throw new Error('Direct clipboard write is not available');
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();

    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
  }

  /**
   * Download image to disk
   *
    * Prioritizes direct anchor download with filename and falls back to background.
    *
    * Why anchor-first:
    * - Some download-manager extensions hook into chrome.downloads APIs and may rewrite
    *   filenames, while the anchor path better preserves the requested business filename.
    * - The anchor path is a lightweight page-context operation and avoids extra message
    *   hops to the service worker when it succeeds.
    *
    * Why keep background fallback:
    * - The anchor path can fail on certain pages/policies, so background download remains
    *   a compatibility fallback to keep the save operation resilient.
   */
  private async download(dataUrl: string, filename: string): Promise<OperationResult> {
    try {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.setAttribute('download', filename);
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { success: true };
    } catch (error) {
      log.warn('anchor download failed, trying background', { error });
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_IMAGE',
        dataUrl,
        filename,
      });
      if (!response || typeof response !== 'object' || !('success' in response) || response.success !== true) {
        const errorMessage =
          response && typeof response === 'object' && 'error' in response && typeof response.error === 'string'
            ? response.error
            : 'Download failed';
        throw new Error(errorMessage);
      }
      log.debug('downloaded', { filename });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('download failed', { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }
}

export const screenshotResult = new ScreenshotResult();
