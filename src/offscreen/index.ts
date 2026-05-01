/**
 * Offscreen document script
 *
 * Chrome extension service workers cannot access DOM APIs directly.
 * This offscreen document provides a DOM context for operations that require:
 * - Canvas API for image manipulation (cropping, stitching)
 * - Clipboard API for copying images
 *
 * The background script sends messages here, and this script processes them
 * and returns the results.
 */

import { DOMRectJson, OffscreenMessage, OffscreenResponse, ViewportInfo } from '@shared/types';
import { createLogger } from '@shared/logger';

const log = createLogger('OffscreenWorker');

// Canvas element for image processing
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

/**
 * Listen for messages from the background service worker
 * Routes each message to the appropriate handler and returns the result
 */
chrome.runtime.onMessage.addListener(
  (message: OffscreenMessage, _sender, sendResponse: (response: OffscreenResponse) => void) => {
    log.trace('message received', { action: message.action });

    handleMessage(message)
      .then((data) => {
        log.debug('operation success', { action: message.action });
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        log.error('operation failed', { action: message.action, error: error.message });
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
);

/**
 * Route messages to appropriate handlers based on action type
 */
async function handleMessage(message: OffscreenMessage): Promise<string | undefined> {
  switch (message.action) {
    case 'COPY_TO_CLIPBOARD':
      // Copy image to system clipboard
      await copyToClipboard(message.dataUrl);
      return undefined;

    case 'CONVERT_FORMAT':
      // Convert image between formats (PNG, JPEG, WebP)
      return convertFormat(message.dataUrl, message.format, message.quality);

    case 'CROP_IMAGE':
      // Crop screenshot to the target element's bounds
      return cropImage(message.dataUrl, message.rect, message.dpr, message.viewport);

    case 'STITCH_IMAGES':
      // Combine multiple tiles into a single large image
      return stitchImages(message.images, message.totalWidth, message.totalHeight, message.dpr || 1);

    default:
      throw new Error(`Unknown action: ${(message as { action: string }).action}`);
  }
}

/**
 * Crop image to the specified rect
 *
 * This handles the conversion between CSS pixels and device pixels (DPR scaling).
 * Chrome's captureVisibleTab returns images at device pixel resolution,
 * so we need to scale the crop coordinates accordingly.
 *
 * Key insight: The actual scale might differ from the reported DPR,
 * so we calculate it by comparing image dimensions to viewport dimensions.
 */
async function cropImage(dataUrl: string, rect: DOMRectJson, dpr: number, viewport: ViewportInfo): Promise<string> {
  log.trace('cropImage', { rect, dpr, viewport });

  const img = await loadImage(dataUrl);

  // Calculate actual scale by comparing image size with viewport
  // Chrome may return images at a different scale than reported DPR
  // (e.g., due to display scaling, browser zoom, etc.)
  // Use separate scales for X and Y to handle non-uniform scaling
  const scaleX = img.width / viewport.innerWidth;
  const scaleY = img.height / viewport.innerHeight;

  log.info('image loaded', {
    imgWidth: img.width,
    imgHeight: img.height,
    viewportWidth: viewport.innerWidth,
    viewportHeight: viewport.innerHeight,
    reportedDpr: dpr,
    scaleX,
    scaleY,
  });

  // Calculate the crop region with separate scales for each dimension
  const cropX = Math.round(rect.left * scaleX);
  const cropY = Math.round(rect.top * scaleY);
  const cropWidth = Math.round(rect.width * scaleX);
  const cropHeight = Math.round(rect.height * scaleY);

  log.debug('crop dimensions', { cropX, cropY, cropWidth, cropHeight });

  // Validate crop dimensions
  if (cropWidth <= 0 || cropHeight <= 0) {
    throw new Error('Invalid crop dimensions');
  }

  // Clamp crop region to image bounds (handles edge cases at scroll boundaries)
  const clampedCropX = Math.max(0, Math.min(cropX, img.width - 1));
  const clampedCropY = Math.max(0, Math.min(cropY, img.height - 1));
  const clampedCropWidth = Math.min(cropWidth, img.width - clampedCropX);
  const clampedCropHeight = Math.min(cropHeight, img.height - clampedCropY);

  // Set canvas size to the cropped dimensions (high DPI)
  canvas.width = clampedCropWidth;
  canvas.height = clampedCropHeight;

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // Draw the cropped region at full resolution
  ctx.drawImage(
    img,
    clampedCropX,
    clampedCropY,
    clampedCropWidth,
    clampedCropHeight,
    0,
    0,
    clampedCropWidth,
    clampedCropHeight
  );

  return canvas.toDataURL('image/png');
}

/**
 * Copy image data URL to system clipboard
 *
 * Uses the Clipboard API which requires a DOM context.
 * The background service worker cannot do this directly.
 */
async function copyToClipboard(dataUrl: string): Promise<void> {
  log.trace('copyToClipboard');

  const blob = await dataUrlToBlob(dataUrl);

  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob,
    }),
  ]);

  log.info('copied to clipboard');
}

/**
 * Convert image to different format using canvas
 *
 * Supports PNG (lossless), JPEG (lossy, white background), and WebP (lossy/lossless)
 *
 * @param dataUrl - Source image as data URL
 * @param format - Target format: 'png', 'jpeg', or 'webp'
 * @param quality - Compression quality (0-1), only affects JPEG and WebP
 */
async function convertFormat(
  dataUrl: string,
  format: 'png' | 'jpeg' | 'webp',
  quality: number = 0.92
): Promise<string> {
  log.trace('convertFormat', { format, quality });

  const img = await loadImage(dataUrl);

  canvas.width = img.width;
  canvas.height = img.height;

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // JPEG doesn't support transparency, fill with white background
  if (format === 'jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(img, 0, 0);

  const mimeType = `image/${format}`;
  return canvas.toDataURL(mimeType, quality);
}

/**
 * Stitch multiple image tiles into one large image
 *
 * Used for capturing elements larger than the viewport.
 * Each tile is already cropped at device pixel resolution.
 * Positions are in CSS pixels and need to be converted to device pixels.
 *
 * The actual scale is inferred from each tile's dimensions using median
 * to ensure accurate positioning regardless of display scaling variations.
 */
async function stitchImages(
  tiles: { dataUrl: string; x: number; y: number; cssWidth: number; cssHeight: number }[],
  totalWidth: number,
  totalHeight: number,
  dpr: number
): Promise<string> {
  log.trace('stitchImages', { tileCount: tiles.length, totalWidth, totalHeight, dpr });

  if (tiles.length === 0) {
    throw new Error('No tiles to stitch');
  }

  // Load all tiles and collect scale information from each
  const loadedTiles: { tile: (typeof tiles)[number]; img: HTMLImageElement }[] = [];
  const scaleXs: number[] = [];
  const scaleYs: number[] = [];

  for (const tile of tiles) {
    const img = await loadImage(tile.dataUrl);
    loadedTiles.push({ tile, img });

    // Calculate scale for this tile (device pixels / CSS pixels)
    const scaleX = tile.cssWidth > 0 ? img.width / tile.cssWidth : NaN;
    const scaleY = tile.cssHeight > 0 ? img.height / tile.cssHeight : NaN;

    if (Number.isFinite(scaleX) && scaleX > 0) scaleXs.push(scaleX);
    if (Number.isFinite(scaleY) && scaleY > 0) scaleYs.push(scaleY);
  }

  // Use median scale to be robust against outliers
  const actualScaleX = scaleXs.length > 0 ? median(scaleXs) : dpr;
  const actualScaleY = scaleYs.length > 0 ? median(scaleYs) : dpr;

  // Set canvas to final size at device pixel resolution
  const finalWidth = Math.max(1, Math.round(totalWidth * actualScaleX));
  const finalHeight = Math.max(1, Math.round(totalHeight * actualScaleY));

  canvas.width = finalWidth;
  canvas.height = finalHeight;

  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // Clear canvas with transparency
  ctx.clearRect(0, 0, finalWidth, finalHeight);

  // Draw each tile at its calculated position
  for (const { tile, img } of loadedTiles) {
    // Convert CSS pixel position to device pixel position
    const destX = Math.round(tile.x * actualScaleX);
    const destY = Math.round(tile.y * actualScaleY);

    log.debug('drawing tile', {
      tileX: tile.x,
      tileY: tile.y,
      destX,
      destY,
      imgWidth: img.width,
      imgHeight: img.height,
    });

    // Draw tile - the image is already at device pixel resolution
    ctx.drawImage(img, destX, destY);
  }

  log.info('images stitched', { finalWidth, finalHeight, actualScaleX, actualScaleY });
  return canvas.toDataURL('image/png');
}

/**
 * Calculate median value from an array of numbers
 * Used to determine the representative scale from multiple tiles
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Load an image from data URL
 * Returns a promise that resolves when the image is ready
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      log.debug('image loaded', { width: img.width, height: img.height });
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Convert data URL to Blob
 * Required for clipboard operations which need Blob objects
 */
function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', dataUrl);
    xhr.responseType = 'blob';
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error('Failed to convert data URL to Blob'));
    xhr.send();
  });
}
