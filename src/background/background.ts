import { BackgroundResponse, BackgroundToContentMessage, ContentMessage } from '@shared/types';
import { loggers } from '@shared/logger';
import { IncompatiblePageError } from '@shared/errors';
import { INCOMPATIBLE_URL_PATTERNS } from '@shared/constants';
import { copyToClipboard, downloadImage } from './offscreen';
import { handleNodeSelected } from './capture';

const log = loggers.background;

chrome.action.onClicked.addListener(async (tab) => {
  log.trace('action onClicked', { tabId: tab.id, url: tab.url });

  if (!tab.id || !tab.url) {
    log.warn('no valid tab');
    return;
  }

  if (!isCompatiblePage(tab.url)) {
    log.warn('incompatible page', { url: tab.url });
    return;
  }

  try {
    await handleStartPick(tab.id);
  } catch (error) {
    log.error('failed to start pick mode', error);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message:
      | ContentMessage
      | { action: 'COPY_TO_CLIPBOARD'; dataUrl: string }
      | { action: 'DOWNLOAD_IMAGE'; dataUrl: string; filename?: string },
    sender,
    sendResponse
  ) => {
    if (message.action === 'COPY_TO_CLIPBOARD' && 'dataUrl' in message) {
      copyToClipboard(message.dataUrl)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message.action === 'DOWNLOAD_IMAGE' && 'dataUrl' in message) {
      log.info('DOWNLOAD_IMAGE received', { filename: message.filename });
      downloadImage(message.dataUrl, message.filename)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    handleMessage(message as ContentMessage, sender)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          action: 'CAPTURE_ERROR',
          reason: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }
);

async function handleMessage(
  message: ContentMessage,
  sender: chrome.runtime.MessageSender
): Promise<BackgroundResponse> {
  log.trace('handleMessage', { action: message.action });

  switch (message.action) {
    case 'NODE_SELECTED':
      log.info('node selected', {
        tabId: sender.tab?.id,
        tabUrl: sender.tab?.url,
        selector: message.selector,
        rect: message.rect,
        scrollContainer: message.scrollContainer,
      });

      if (!sender.tab?.id) {
        return { action: 'CAPTURE_ERROR', reason: 'Unable to get page information' };
      }

      return handleNodeSelected(
        sender.tab.id,
        message.selector,
        message.rect,
        message.dpr,
        message.viewport,
        message.scrollContainer
      );

    case 'PICK_CANCELLED':
      log.info('pick cancelled');
      return { action: 'CAPTURE_ERROR', reason: 'Selection cancelled' };

    case 'PICK_ERROR':
      log.warn('pick error', { reason: message.reason });
      return { action: 'CAPTURE_ERROR', reason: message.reason };

    default:
      log.error('unknown action', { message });
      throw new Error(`Unknown action: ${(message as { action: string }).action}`);
  }
}

async function handleStartPick(tabId: number): Promise<void> {
  log.trace('handleStartPick', { tabId });

  const tab = await chrome.tabs.get(tabId);
  if (!isCompatiblePage(tab.url)) {
    throw new IncompatiblePageError('This page type is not supported');
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ENTER_PICK_MODE' } as BackgroundToContentMessage);
    log.info('enter pick mode message sent');
  } catch (error) {
    log.error('failed to send message, content script may not be loaded', error);
    throw new Error('Please refresh the page and try again');
  }
}

/**
 * Check if a page URL is compatible with the extension
 */
function isCompatiblePage(url: string | undefined): boolean {
  if (!url) return false;

  const patterns = INCOMPATIBLE_URL_PATTERNS;

  if (patterns.CHROME_URL.test(url)) return false;
  if (patterns.CHROME_EXTENSION_URL.test(url)) return false;
  if (patterns.FILE_URL.test(url)) return false;
  if (patterns.ABOUT_URL.test(url)) return false;
  if (patterns.EDGE_URL.test(url)) return false;
  if (patterns.NEW_TAB_PAGE.test(url)) return false;

  // Must be http or https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  return true;
}
