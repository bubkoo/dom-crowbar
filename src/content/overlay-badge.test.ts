import { describe, expect, it } from 'vitest';
import { buildBadgeText, calculateBadgePosition } from './overlay-badge';

describe('buildBadgeText', () => {
    it('renders selector and rounded dimensions', () => {
        const text = buildBadgeText({
            selector: '#target',
            width: 100.4,
            height: 49.6,
            parentIndex: 0,
            parentStackLength: 1,
            expandTop: 0,
            expandRight: 0,
            expandBottom: 0,
            expandLeft: 0,
        });

        expect(text).toContain('#target');
        expect(text).toContain('100 × 50');
        expect(text).toContain('〔↵〕');
        expect(text).toContain('〔?〕');
    });

    it('includes depth and expansion arrows when present', () => {
        const text = buildBadgeText({
            selector: 'div.card',
            width: 200,
            height: 80,
            parentIndex: 2,
            parentStackLength: 5,
            expandTop: 3,
            expandRight: 4,
            expandBottom: 1,
            expandLeft: 2,
        });

        expect(text).toContain('[2/4]');
        expect(text).toContain('↑3');
        expect(text).toContain('→4');
        expect(text).toContain('↓1');
        expect(text).toContain('←2');
    });
});

describe('calculateBadgePosition', () => {
    it('places badge above target when there is room', () => {
        const position = calculateBadgePosition({
            rectLeft: 100,
            rectTop: 80,
            rectBottom: 140,
            rectWidth: 200,
            badgeWidth: 80,
            badgeHeight: 20,
            viewportWidth: 1200,
            viewportHeight: 800,
        });

        expect(position.top).toBe(56);
        expect(position.left).toBe(160);
    });

    it('places badge below target when above has no room', () => {
        const position = calculateBadgePosition({
            rectLeft: 100,
            rectTop: 10,
            rectBottom: 40,
            rectWidth: 200,
            badgeWidth: 80,
            badgeHeight: 20,
            viewportWidth: 1200,
            viewportHeight: 800,
        });

        expect(position.top).toBe(44);
    });

    it('falls back to golden-ratio Y when neither above nor below fits', () => {
        const position = calculateBadgePosition({
            rectLeft: 100,
            rectTop: 5,
            rectBottom: 780,
            rectWidth: 200,
            badgeWidth: 80,
            badgeHeight: 40,
            viewportWidth: 1200,
            viewportHeight: 800,
        });

        expect(position.top).toBe(800 * 0.382);
    });

    it('clamps badge left position to viewport margins', () => {
        const position = calculateBadgePosition({
            rectLeft: -300,
            rectTop: 80,
            rectBottom: 140,
            rectWidth: 100,
            badgeWidth: 120,
            badgeHeight: 20,
            viewportWidth: 300,
            viewportHeight: 800,
        });

        expect(position.left).toBe(8);
    });
});
