import { DOMRectJson, OffscreenResponse, ViewportInfo } from '@shared/types';

const offscreenIdleTimeoutMs = 30_000;
let offscreenCloseTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleOffscreenClose(): void {
  if (offscreenCloseTimer) {
    clearTimeout(offscreenCloseTimer);
  }

  offscreenCloseTimer = setTimeout(async () => {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
    } finally {
      offscreenCloseTimer = null;
    }
  }, offscreenIdleTimeoutMs);
}

async function ensureOffscreenDocument(justification: string): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    scheduleOffscreenClose();
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.WORKERS],
      justification,
    });
  } catch {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/index.html',
      reasons: [chrome.offscreen.Reason.CLIPBOARD, chrome.offscreen.Reason.WORKERS],
      justification,
    });
  }

  scheduleOffscreenClose();
}

export async function copyToClipboard(dataUrl: string): Promise<void> {
  await ensureOffscreenDocument('Image operations');

  const response = await chrome.runtime.sendMessage({
    action: 'COPY_TO_CLIPBOARD',
    dataUrl,
  }) as OffscreenResponse;

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to copy to clipboard');
  }

  scheduleOffscreenClose();
}

export async function downloadImage(dataUrl: string, filename?: string): Promise<void> {
  const resolvedFilename = filename || `screenshot-${Date.now()}.png`;
  await new Promise<number>((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: resolvedFilename,
        saveAs: false,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        const lastError = chrome.runtime.lastError;
        if (lastError?.message) {
          reject(new Error(lastError.message));
          return;
        }
        if (typeof downloadId !== 'number') {
          reject(new Error('Download failed'));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

export async function stitchImages(
  tiles: { dataUrl: string; x: number; y: number; cssWidth: number; cssHeight: number }[],
  totalWidth: number,
  totalHeight: number,
  dpr: number
): Promise<string> {
  await ensureOffscreenDocument('Image operations');

  const response = await chrome.runtime.sendMessage({
    action: 'STITCH_IMAGES',
    images: tiles,
    totalWidth,
    totalHeight,
    dpr,
  }) as OffscreenResponse;

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to stitch images');
  }

  if (!response.data) {
    throw new Error('Failed to stitch images');
  }

  scheduleOffscreenClose();
  return response.data;
}

export async function cropImage(
  dataUrl: string,
  rect: DOMRectJson,
  dpr: number,
  viewport: ViewportInfo
): Promise<string> {
  await ensureOffscreenDocument('Image operations');

  const response = await chrome.runtime.sendMessage({
    action: 'CROP_IMAGE',
    dataUrl,
    rect,
    dpr,
    viewport,
  }) as OffscreenResponse;

  if (!response || !response.success) {
    throw new Error(response?.error || 'Failed to crop image');
  }

  if (!response.data) {
    throw new Error('Failed to crop image');
  }

  scheduleOffscreenClose();
  return response.data;
}
