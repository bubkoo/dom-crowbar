/**
 * DOM node selection overlay
 *
 * Provides interactive node highlighting and selection on hover/click.
 * This is the main UI component for the "pick mode" screenshot feature.
 *
 * Features:
 * - Hover highlighting with animated gradient border
 * - Badge showing element selector and dimensions
 * - Parent/child traversal with keyboard shortcuts
 * - Selection area expansion with arrow keys
 * - Help overlay with keyboard shortcuts
 */

import { buildUniqueSelector } from './selector-builder';
import { DOMRectJson } from '@shared/types';
import { loggers } from '@shared/logger';
import { HelpLayoutVariant, WordmarkVariant, renderHelpOverlay } from './overlay-template.ts';
import { buildBadgeText, calculateBadgePosition } from './overlay-badge.ts';
import { bindOverlayEvents } from './overlay-events.ts';
import './overlay.css';

const log = loggers.overlay;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Toggle footer logo style here.
const helpWordmarkVariant: WordmarkVariant = 'subtle';
// Toggle help panel layout here.
const helpLayoutVariant: HelpLayoutVariant = 'grouped';

type SelectionCallback = (selector: string, rect: DOMRectJson) => void;
type CancelCallback = () => void;

class NodeOverlay {
  private overlayEl: HTMLDivElement | null = null;
  private badgeEl: HTMLDivElement | null = null;
  private helpEl: HTMLDivElement | null = null;

  private onSelectCallback: SelectionCallback | null = null;
  private onCancelCallback: CancelCallback | null = null;

  private isActive = false;
  private hoveredElement: Element | null = null;
  private highlightedElement: Element | null = null;

  private parentStack: Element[] = [];
  private parentIndex = 0;

  private isScrolling = false;
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private unbindOverlayEvents: (() => void) | null = null;

  private expandTop = 0;
  private expandRight = 0;
  private expandBottom = 0;
  private expandLeft = 0;

  enter(): void {
    log.trace('enter');
    if (this.isActive) return;

    this.isActive = true;
    this.resetExpansion();
    this.createOverlayElements();
    this.bindEvents();

    document.body.style.cursor = 'crosshair';
    log.info('overlay activated');
  }

  exit(): void {
    log.trace('exit');
    if (!this.isActive) return;

    this.isActive = false;
    this.unbindEvents();
    this.removeOverlayElements();
    this.hideHelp();

    document.body.style.cursor = '';
    log.info('overlay deactivated');
  }

  onSelect(callback: SelectionCallback): void {
    this.onSelectCallback = callback;
  }

  onCancel(callback: CancelCallback): void {
    this.onCancelCallback = callback;
  }

  private createOverlayElements(): void {
    this.overlayEl = this.createOverlayContainer();
    this.badgeEl = this.createBadgeElement();

    document.body.appendChild(this.overlayEl);
    document.body.appendChild(this.badgeEl);
  }

  private createOverlayContainer(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = 'dom-crowbar-overlay';
    overlay.className = 'dom-crowbar-overlay';
    overlay.appendChild(this.createOverlaySvg());
    return overlay;
  }

  private createBadgeElement(): HTMLDivElement {
    const badge = document.createElement('div');
    badge.id = 'dom-crowbar-badge';
    badge.className = 'dom-crowbar-badge';
    return badge;
  }

  private createOverlaySvg(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('class', 'dom-crowbar-overlay-svg');

    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.appendChild(this.createAnimatedGradient());
    svg.appendChild(defs);
    svg.appendChild(this.createBorderRect());

    return svg;
  }

  private createAnimatedGradient(): SVGLinearGradientElement {
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', 'dom-crowbar-gradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stops = [
      { offset: '0%', color: '#6366F1' },
      { offset: '33%', color: '#8B5CF6' },
      { offset: '66%', color: '#06B6D4' },
      { offset: '100%', color: '#6366F1' },
    ];

    for (const { offset, color } of stops) {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      gradient.appendChild(stop);
    }

    const animations = [
      { attributeName: 'x1', values: '0%;100%;0%' },
      { attributeName: 'y1', values: '0%;100%;0%' },
      { attributeName: 'x2', values: '100%;0%;100%' },
      { attributeName: 'y2', values: '100%;0%;100%' },
    ];

    for (const animationConfig of animations) {
      const animation = document.createElementNS(SVG_NS, 'animate');
      animation.setAttribute('attributeName', animationConfig.attributeName);
      animation.setAttribute('values', animationConfig.values);
      animation.setAttribute('dur', '4s');
      animation.setAttribute('repeatCount', 'indefinite');
      animation.setAttribute('calcMode', 'spline');
      animation.setAttribute('keySplines', '0.4 0 0.6 1;0.4 0 0.6 1');
      gradient.appendChild(animation);
    }

    return gradient;
  }

  private createBorderRect(): SVGRectElement {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '1');
    rect.setAttribute('y', '1');
    rect.setAttribute('rx', '0');
    rect.setAttribute('ry', '0');
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'url(#dom-crowbar-gradient)');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6 4');
    rect.id = 'dom-crowbar-border-rect';

    const dashAnimate = document.createElementNS(SVG_NS, 'animate');
    dashAnimate.setAttribute('attributeName', 'stroke-dashoffset');
    dashAnimate.setAttribute('values', '0;20');
    dashAnimate.setAttribute('dur', '1s');
    dashAnimate.setAttribute('repeatCount', 'indefinite');
    rect.appendChild(dashAnimate);

    return rect;
  }

  private removeOverlayElements(): void {
    this.overlayEl?.remove();
    this.badgeEl?.remove();
    this.overlayEl = null;
    this.badgeEl = null;
  }

  private bindEvents(): void {
    this.unbindOverlayEvents = bindOverlayEvents({
      handleMouseMove: this.handleMouseMove,
      handleClick: this.handleClick,
      handleKeyDown: this.handleKeyDown,
      handleKeyUp: this.handleKeyUp,
      handleScroll: this.handleScroll,
    });
  }

  private unbindEvents(): void {
    this.unbindOverlayEvents?.();
    this.unbindOverlayEvents = null;
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isActive) return;

    const target = e.target as Element;

    if (target.id === 'dom-crowbar-overlay' || target.id === 'dom-crowbar-badge') {
      return;
    }

    if (target !== this.hoveredElement) {
      this.hoveredElement = target;
      this.parentStack = [];
      this.parentIndex = 0;
      this.resetExpansion();

      let current: Element | null = target;
      while (current && current !== document.body && current !== document.documentElement) {
        this.parentStack.push(current);
        current = current.parentElement;
      }

      this.highlightedElement = target;
    }

    this.highlight(this.highlightedElement || target);
  };

  private handleClick = (e: MouseEvent): void => {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.target instanceof Element &&
      (e.target.id === 'dom-crowbar-overlay' || e.target.id === 'dom-crowbar-badge')) {
      return;
    }

    if (this.highlightedElement) {
      this.selectElement(this.highlightedElement);
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isActive) return;

    const keyActions: Record<string, () => void> = {
      Escape: () => {
        log.info('cancelled by ESC');
        this.exit();
        this.onCancelCallback?.();
      },
      Enter: () => {
        if (this.highlightedElement) {
          this.selectElement(this.highlightedElement);
        }
      },
      '?': () => this.showHelp(),
      '/': () => this.showHelp(),
      '[': () => this.moveInParentStack(-1),
      ']': () => this.moveInParentStack(1),
      ArrowUp: () => this.adjustExpansion(1, 0, 0, 0),
      ArrowDown: () => this.adjustExpansion(0, 0, 1, 0),
      ArrowLeft: () => this.adjustExpansion(0, 0, 0, 1),
      ArrowRight: () => this.adjustExpansion(0, 1, 0, 0),
      '+': () => this.adjustExpansion(1, 1, 1, 1),
      '=': () => this.adjustExpansion(1, 1, 1, 1),
      '-': () => this.adjustExpansion(-1, -1, -1, -1, true),
    };

    const action = keyActions[e.key];
    if (!action) return;

    e.preventDefault();
    action();
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (!this.isActive) return;
    if (e.key === '?' || e.key === '/') {
      this.hideHelp();
    }
  };

  private resetExpansion(): void {
    this.expandTop = 0;
    this.expandRight = 0;
    this.expandBottom = 0;
    this.expandLeft = 0;
  }

  private moveInParentStack(step: -1 | 1): void {
    if (step < 0) {
      if (this.parentIndex <= 0) return;
      this.parentIndex--;
    } else {
      if (this.parentStack.length === 0 || this.parentIndex >= this.parentStack.length - 1) return;
      this.parentIndex++;
    }

    this.resetExpansion();
    this.highlightedElement = this.parentStack[this.parentIndex];
    this.refreshHighlightedElement();
  }

  private adjustExpansion(
    topDelta: number,
    rightDelta: number,
    bottomDelta: number,
    leftDelta: number,
    clampToZero = false
  ): void {
    if (clampToZero) {
      this.expandTop = Math.max(0, this.expandTop + topDelta);
      this.expandRight = Math.max(0, this.expandRight + rightDelta);
      this.expandBottom = Math.max(0, this.expandBottom + bottomDelta);
      this.expandLeft = Math.max(0, this.expandLeft + leftDelta);
    } else {
      this.expandTop += topDelta;
      this.expandRight += rightDelta;
      this.expandBottom += bottomDelta;
      this.expandLeft += leftDelta;
    }

    this.refreshHighlightedElement();
  }

  private refreshHighlightedElement(): void {
    if (this.highlightedElement) {
      this.highlight(this.highlightedElement);
    }
  }

  private handleScroll = (): void => {
    if (!this.isActive) return;

    if (!this.isScrolling) {
      this.isScrolling = true;
      this.hideOverlay();
    }

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
      if (this.highlightedElement) {
        this.highlight(this.highlightedElement);
      }
    }, 150);
  };

  private hideOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.style.display = 'none';
    }
    if (this.badgeEl) {
      this.badgeEl.style.display = 'none';
    }
  }

  private showHelp(): void {
    if (this.helpEl) return;
    this.helpEl = document.createElement('div');
    this.helpEl.id = 'dom-crowbar-help';
    renderHelpOverlay(this.helpEl, helpWordmarkVariant, helpLayoutVariant);
    document.body.appendChild(this.helpEl);
  }

  private hideHelp(): void {
    if (this.helpEl) {
      this.helpEl.remove();
      this.helpEl = null;
    }
  }

  private highlight(el: Element): void {
    if (!this.overlayEl || !this.badgeEl) return;

    const originalRect = el.getBoundingClientRect();
    const rect = this.expandRect(originalRect);

    this.overlayEl.style.display = 'block';
    this.overlayEl.style.left = `${rect.left}px`;
    this.overlayEl.style.top = `${rect.top}px`;
    this.overlayEl.style.width = `${rect.width}px`;
    this.overlayEl.style.height = `${rect.height}px`;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isLargeElement = rect.width >= viewportWidth * 0.8 || rect.height >= viewportHeight * 0.8;

    const svgRect = this.overlayEl.querySelector('#dom-crowbar-border-rect');
    if (svgRect) {
      svgRect.setAttribute('width', String(rect.width - 2));
      svgRect.setAttribute('height', String(rect.height - 2));
      svgRect.setAttribute('stroke-width', isLargeElement ? '4' : '2');
      svgRect.setAttribute('stroke-dasharray', isLargeElement ? '12 6' : '6 4');
    }

    const selector = this.getElementSelector(el);
    this.badgeEl.textContent = buildBadgeText({
      selector,
      width: rect.width,
      height: rect.height,
      parentIndex: this.parentIndex,
      parentStackLength: this.parentStack.length,
      expandTop: this.expandTop,
      expandRight: this.expandRight,
      expandBottom: this.expandBottom,
      expandLeft: this.expandLeft,
    });
    this.badgeEl.style.display = 'block';

    const badgeRect = this.badgeEl.getBoundingClientRect();
    const badgePosition = calculateBadgePosition({
      rectLeft: rect.left,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      rectWidth: rect.width,
      badgeWidth: badgeRect.width,
      badgeHeight: badgeRect.height,
      viewportWidth,
      viewportHeight,
    });

    this.badgeEl.style.top = `${badgePosition.top}px`;
    this.badgeEl.style.left = `${badgePosition.left}px`;
  }

  private selectElement(el: Element): void {
    log.trace('selectElement', { tag: el.tagName });

    const originalRect = el.getBoundingClientRect();
    const selector = buildUniqueSelector(el);

    const expandedRect = this.expandRect(originalRect);

    log.debug('element selected', { selector, rect: expandedRect, expand: { top: this.expandTop, right: this.expandRight, bottom: this.expandBottom, left: this.expandLeft } });

    this.exit();

    requestAnimationFrame(() => {
      this.onSelectCallback?.(selector, expandedRect);
    });
  }

  private getElementSelector(el: Element): string {
    const tag = el.tagName.toLowerCase();

    if (el.id) {
      return `#${el.id}`;
    }

    const classes = Array.from(el.classList);
    const meaningfulClass = classes.find(
      (c) =>
        !c.startsWith('_') &&
        !c.startsWith('js-') &&
        !c.includes('--') &&
        c.length > 1 &&
        c.length < 30
    );

    if (meaningfulClass) {
      return `${tag}.${meaningfulClass}`;
    }

    return tag;
  }

  private expandRect(rect: DOMRect): DOMRectJson {
    return {
      x: rect.x - this.expandLeft,
      y: rect.y - this.expandTop,
      width: rect.width + this.expandLeft + this.expandRight,
      height: rect.height + this.expandTop + this.expandBottom,
      top: rect.top - this.expandTop,
      right: rect.right + this.expandRight,
      bottom: rect.bottom + this.expandBottom,
      left: rect.left - this.expandLeft,
    };
  }
}

export const nodeOverlay = new NodeOverlay();
