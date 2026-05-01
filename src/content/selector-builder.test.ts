/**
 * Tests for CSS selector builder
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildUniqueSelector } from './selector-builder';

describe('buildUniqueSelector', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return ID selector for element with unique ID', () => {
    container.innerHTML = '<div id="unique-element"></div>';
    const el = container.querySelector('#unique-element')!;
    expect(buildUniqueSelector(el)).toBe('#unique-element');
  });

  it('should escape special characters in ID', () => {
    container.innerHTML = '<div id="element.with.dots"></div>';
    const el = container.querySelector('[id="element.with.dots"]')!;
    const selector = buildUniqueSelector(el);
    // Should escape dots in selector
    expect(selector).toContain('\\');
  });

  it('should use tag + class for element without ID', () => {
    container.innerHTML = '<div class="container"></div>';
    const el = container.querySelector('.container')!;
    const selector = buildUniqueSelector(el);
    expect(selector).toMatch(/^div/);
  });

  it('should use nth-child for elements with same tag', () => {
    container.innerHTML = `
      <div class="parent">
        <span>First</span>
        <span>Second</span>
        <span>Third</span>
      </div>
    `;
    const spans = container.querySelectorAll('span');
    const secondSpan = spans[1];
    const selector = buildUniqueSelector(secondSpan);
    expect(selector).toContain('nth-of-type');
    expect(container.querySelector(selector)).toBe(secondSpan);
  });

  it('should use nth-of-type correctly when sibling tags are mixed', () => {
    container.innerHTML = `
      <div class="parent">
        <span>First</span>
        <div>Other</div>
        <span>Second</span>
      </div>
    `;
    const spans = container.querySelectorAll('span');
    const secondSpan = spans[1];
    const selector = buildUniqueSelector(secondSpan);
    expect(selector).toContain('nth-of-type');
    expect(container.querySelector(selector)).toBe(secondSpan);
  });

  it('should build path up to document root for uniqueness', () => {
    container.innerHTML = `
      <article class="post">
        <header class="post-header">
          <h1 class="title">Title</h1>
        </header>
      </article>
    `;
    const title = container.querySelector('.title')!;
    const selector = buildUniqueSelector(title);
    // Should be a valid selector that selects the element
    expect(container.querySelector(selector)).toBe(title);
  });

  it('should handle deeply nested elements', () => {
    container.innerHTML = `
      <main>
        <section>
          <div>
            <ul>
              <li><a href="#" class="link">Link</a></li>
            </ul>
          </div>
        </section>
      </main>
    `;
    const link = container.querySelector('.link')!;
    const selector = buildUniqueSelector(link);
    expect(container.querySelector(selector)).toBe(link);
  });
});
