import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHelpOverlay } from './overlay-template';

describe('renderHelpOverlay', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        container.remove();
    });

    it('renders classic layout by default with subtle wordmark', () => {
        renderHelpOverlay(container, 'subtle');

        const card = container.querySelector('.dom-crowbar-help-card');
        const groupedCard = container.querySelector('.dom-crowbar-help-card--grouped');
        const wordmark = container.querySelector('.dom-crowbar-help-wordmark');

        expect(card).not.toBeNull();
        expect(groupedCard).toBeNull();
        expect(wordmark).not.toBeNull();
        expect(wordmark?.classList.contains('dom-crowbar-help-wordmark--subtle')).toBe(true);
        expect(wordmark?.textContent).toContain('dom • crowbar');

        const separators = container.querySelectorAll('.dom-crowbar-help-separator');
        expect(separators.length).toBe(3);
    });

    it('renders grouped layout with grouped sections and hint text', () => {
        renderHelpOverlay(container, 'subtle', 'grouped');

        const groupedCard = container.querySelector('.dom-crowbar-help-card--grouped');
        const hint = container.querySelector('.dom-crowbar-help-hint');
        const groups = container.querySelectorAll('.dom-crowbar-help-group');
        const groupedRows = container.querySelectorAll('.dom-crowbar-help-row--grouped');

        expect(groupedCard).not.toBeNull();
        expect(hint?.textContent).toContain('Hold ? or / to open this panel');
        expect(groups.length).toBe(3);
        expect(groupedRows.length).toBe(10);
    });

    it('applies key width classes for single and wide keys', () => {
        renderHelpOverlay(container, 'subtle');

        const keys = Array.from(container.querySelectorAll('kbd.dom-crowbar-help-key'));
        const enterKey = keys.find((key) => key.textContent === 'Enter');
        const escKey = keys.find((key) => key.textContent === 'Esc');
        const bracketKey = keys.find((key) => key.textContent === ']');

        expect(enterKey?.classList.contains('dom-crowbar-help-key--wide')).toBe(true);
        expect(escKey?.classList.contains('dom-crowbar-help-key--wide')).toBe(true);
        expect(bracketKey?.classList.contains('dom-crowbar-help-key--single')).toBe(true);
    });

    it('switches wordmark variant class on rerender', () => {
        renderHelpOverlay(container, 'subtle', 'grouped');
        renderHelpOverlay(container, 'neon', 'grouped');

        const wordmark = container.querySelector('.dom-crowbar-help-wordmark');

        expect(wordmark?.classList.contains('dom-crowbar-help-wordmark--neon')).toBe(true);
        expect(wordmark?.classList.contains('dom-crowbar-help-wordmark--subtle')).toBe(false);
    });

    it('keeps classic shortcut rows in a stable order', () => {
        renderHelpOverlay(container, 'subtle', 'classic');

        const rows = Array.from(container.querySelectorAll('.dom-crowbar-help-row')).map((row) => {
            const label = row.querySelector('.dom-crowbar-help-label')?.textContent?.trim();
            const key = row.querySelector('kbd')?.textContent?.trim();
            return `${label}:${key}`;
        });

        expect(rows).toEqual([
            'Select parent:]',
            'Select child:[',
            'Expand top:↑',
            'Expand bottom:↓',
            'Expand left:←',
            'Expand right:→',
            'Expand all:+',
            'Shrink all:-',
            'Confirm capture:Enter',
            'Cancel:Esc',
        ]);
    });

    it('keeps grouped section titles and row composition stable', () => {
        renderHelpOverlay(container, 'subtle', 'grouped');

        const groupTitles = Array.from(container.querySelectorAll('.dom-crowbar-help-group-title')).map((el) =>
            el.textContent?.trim()
        );
        expect(groupTitles).toEqual(['Element Navigation', 'Bounds Adjustment', 'Capture Actions']);

        const groupRows = Array.from(container.querySelectorAll('.dom-crowbar-help-group')).map((group) =>
            Array.from(group.querySelectorAll('.dom-crowbar-help-row--grouped')).map((row) => {
                const label = row.querySelector('.dom-crowbar-help-label')?.textContent?.trim();
                const keys = Array.from(row.querySelectorAll('kbd')).map((key) => key.textContent?.trim()).join('+');
                return `${label}:${keys}`;
            })
        );

        expect(groupRows).toEqual([
            ['Select parent:]', 'Select child:['],
            [
                'Expand top:↑',
                'Expand bottom:↓',
                'Expand left:←',
                'Expand right:→',
                'Expand all:+',
                'Shrink all:-',
            ],
            ['Confirm capture:Enter', 'Cancel:Esc'],
        ]);
    });
});