/**
 * Shared type definitions for the extension
 */

// ============ Basic Types ============

export interface Size {
  width: number;
  height: number;
}

export interface DOMRectJson {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ============ Message Protocol ============

/**
 * Content script -> Background messages
 */
export type PickErrorReason = 'ESC_CANCELLED' | 'IFRAME_NOT_SUPPORTED';

export interface ViewportInfo {
  innerWidth: number;
  innerHeight: number;
  scrollX: number;
  scrollY: number;
}

export interface ScrollContainerInfo {
  hasScrollableContainer: boolean;
  containerScrollLeft?: number;
  containerScrollTop?: number;
  // Selector to find the scrollable container
  containerSelector?: string;
  // Element's position relative to the container
  elementRelativeLeft?: number;
  elementRelativeTop?: number;
  // Container's visible dimensions
  containerClientWidth?: number;
  containerClientHeight?: number;
}

export type ContentMessage =
  | { action: 'NODE_SELECTED'; selector: string; rect: DOMRectJson; dpr: number; viewport: ViewportInfo; scrollContainer?: ScrollContainerInfo }
  | { action: 'PICK_CANCELLED' }
  | { action: 'PICK_ERROR'; reason: PickErrorReason };

/**
 * Background -> Content script messages
 */
export type BackgroundToContentMessage =
  | { action: 'ENTER_PICK_MODE' }
  | { action: 'EXIT_PICK_MODE' }
  | { action: 'CAPTURE_SUCCESS'; dataUrl: string; size: Size; selector: string }
  | { action: 'CAPTURE_ERROR'; reason: string };

/**
 * Background response types
 */
export type BackgroundResponse =
  | { action: 'CAPTURE_SUCCESS'; dataUrl: string; size: Size; selector: string }
  | { action: 'CAPTURE_ERROR'; reason: string };

/**
 * Offscreen document messages
 */
export type OffscreenMessage =
  | { action: 'COPY_TO_CLIPBOARD'; dataUrl: string }
  | { action: 'CONVERT_FORMAT'; dataUrl: string; format: 'png' | 'jpeg' | 'webp'; quality?: number }
  | { action: 'CROP_IMAGE'; dataUrl: string; rect: DOMRectJson; dpr: number; viewport: ViewportInfo }
  | {
    action: 'STITCH_IMAGES';
    images: { dataUrl: string; x: number; y: number; cssWidth: number; cssHeight: number }[];
    totalWidth: number;
    totalHeight: number;
    dpr?: number;
  };

export type OffscreenResponse =
  | { success: true; data?: string }
  | { success: false; error: string };
