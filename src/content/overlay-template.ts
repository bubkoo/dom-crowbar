import { html, render } from 'lit-html';
import { t } from '@shared/i18n';

export type WordmarkVariant = 'subtle' | 'neon';
export type HelpLayoutVariant = 'classic' | 'grouped';

type HelpShortcutItem = { separator: true } | { labelKey: string; keyLabel: string };
type GroupedHelpItem = { labelKey: string; keyLabels: string[] };

const HELP_WORDMARK_CLASS: Record<WordmarkVariant, string> = {
  subtle: 'dom-crowbar-help-wordmark--subtle',
  neon: 'dom-crowbar-help-wordmark--neon',
};

const HELP_SHORTCUT_ITEMS: HelpShortcutItem[] = [
  { labelKey: 'overlayHelpSelectParent', keyLabel: ']' },
  { labelKey: 'overlayHelpSelectChild', keyLabel: '[' },
  { separator: true },
  { labelKey: 'overlayHelpExpandTop', keyLabel: '↑' },
  { labelKey: 'overlayHelpExpandBottom', keyLabel: '↓' },
  { labelKey: 'overlayHelpExpandLeft', keyLabel: '←' },
  { labelKey: 'overlayHelpExpandRight', keyLabel: '→' },
  { separator: true },
  { labelKey: 'overlayHelpExpandAll', keyLabel: '+' },
  { labelKey: 'overlayHelpShrinkAll', keyLabel: '-' },
  { separator: true },
  { labelKey: 'overlayHelpConfirmCapture', keyLabel: 'Enter' },
  { labelKey: 'overlayHelpCancel', keyLabel: 'Esc' },
];

const HELP_GROUPED_ITEMS: Array<{ titleKey: string; items: GroupedHelpItem[] }> = [
  {
    titleKey: 'overlayHelpGroupNavigate',
    items: [
      { labelKey: 'overlayHelpSelectParent', keyLabels: [']'] },
      { labelKey: 'overlayHelpSelectChild', keyLabels: ['['] },
    ],
  },
  {
    titleKey: 'overlayHelpGroupAdjust',
    items: [
      { labelKey: 'overlayHelpExpandTop', keyLabels: ['↑'] },
      { labelKey: 'overlayHelpExpandBottom', keyLabels: ['↓'] },
      { labelKey: 'overlayHelpExpandLeft', keyLabels: ['←'] },
      { labelKey: 'overlayHelpExpandRight', keyLabels: ['→'] },
      { labelKey: 'overlayHelpExpandAll', keyLabels: ['+'] },
      { labelKey: 'overlayHelpShrinkAll', keyLabels: ['-'] },
    ],
  },
  {
    titleKey: 'overlayHelpGroupAction',
    items: [
      { labelKey: 'overlayHelpConfirmCapture', keyLabels: ['Enter'] },
      { labelKey: 'overlayHelpCancel', keyLabels: ['Esc'] },
    ],
  },
];

function getKeySizeClass(keyLabel: string): string {
  const normalized = keyLabel.toLowerCase();
  if (normalized === 'enter' || normalized === 'esc') {
    return 'dom-crowbar-help-key--wide';
  }
  return keyLabel.length === 1 ? 'dom-crowbar-help-key--single' : '';
}

function helpShortcutItemTemplate(item: HelpShortcutItem) {
  if ('separator' in item) {
    return html`<div class="dom-crowbar-help-separator"></div>`;
  }

  return html`
    <div class="dom-crowbar-help-row">
      <span class="dom-crowbar-help-label">${t(item.labelKey)}</span>
      <span class="dom-crowbar-help-key-wrap">
        <kbd class=${`dom-crowbar-help-key ${getKeySizeClass(item.keyLabel)}`.trim()}>${item.keyLabel}</kbd>
      </span>
    </div>
  `;
}

function groupedHelpItemTemplate(item: GroupedHelpItem) {
  return html`
    <div class="dom-crowbar-help-row dom-crowbar-help-row--grouped">
      <span class="dom-crowbar-help-label">${t(item.labelKey)}</span>
      <span class="dom-crowbar-help-key-wrap dom-crowbar-help-key-wrap--grouped">
        ${item.keyLabels.map((keyLabel) => html`
          <kbd class=${`dom-crowbar-help-key ${getKeySizeClass(keyLabel)}`.trim()}>${keyLabel}</kbd>
        `)}
      </span>
    </div>
  `;
}

function helpOverlayClassicTemplate(wordmarkVariant: WordmarkVariant) {
  return html`
    <div class="dom-crowbar-help-card">
      <div class="dom-crowbar-help-title">${t('overlayHelpTitle')}</div>
      <div class="dom-crowbar-help-grid">
        ${HELP_SHORTCUT_ITEMS.map((item) => helpShortcutItemTemplate(item))}
      </div>
      <div class=${`dom-crowbar-help-wordmark ${HELP_WORDMARK_CLASS[wordmarkVariant]}`}>
        ${t('extensionName').replace('-', ' • ')}
      </div>
    </div>
  `;
}

function helpOverlayGroupedTemplate(wordmarkVariant: WordmarkVariant) {
  return html`
    <div class="dom-crowbar-help-card dom-crowbar-help-card--grouped">
      <div class="dom-crowbar-help-title">${t('overlayHelpTitle')}</div>
      <div class="dom-crowbar-help-hint">${t('overlayHelpHint')}</div>
      <div class="dom-crowbar-help-group-list">
        ${HELP_GROUPED_ITEMS.map((group) => html`
          <section class="dom-crowbar-help-group">
            <div class="dom-crowbar-help-group-title">${t(group.titleKey)}</div>
            <div class="dom-crowbar-help-grid dom-crowbar-help-grid--grouped">
              ${group.items.map((item) => groupedHelpItemTemplate(item))}
            </div>
          </section>
        `)}
      </div>
      <div class=${`dom-crowbar-help-wordmark ${HELP_WORDMARK_CLASS[wordmarkVariant]}`}>
        ${t('extensionName').replace('-', ' • ')}
      </div>
    </div>
  `;
}

export function renderHelpOverlay(
  container: HTMLElement,
  wordmarkVariant: WordmarkVariant,
  layoutVariant: HelpLayoutVariant = 'classic'
): void {
  const template = layoutVariant === 'grouped'
    ? helpOverlayGroupedTemplate(wordmarkVariant)
    : helpOverlayClassicTemplate(wordmarkVariant);
  render(template, container);
}
