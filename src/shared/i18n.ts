const fallbackMessages: Record<string, string> = {
    extensionName: 'dom-crowbar',
    overlayHelpTitle: 'Keyboard Shortcuts',
    overlayHelpHint: 'Hold ? or / to open this panel',
    overlayHelpGroupNavigate: 'Element Navigation',
    overlayHelpGroupAdjust: 'Bounds Adjustment',
    overlayHelpGroupAction: 'Capture Actions',
    overlayHelpSelectParent: 'Select parent',
    overlayHelpSelectChild: 'Select child',
    overlayHelpExpandTop: 'Expand top',
    overlayHelpExpandBottom: 'Expand bottom',
    overlayHelpExpandLeft: 'Expand left',
    overlayHelpExpandRight: 'Expand right',
    overlayHelpExpandAll: 'Expand all',
    overlayHelpShrinkAll: 'Shrink all',
    overlayHelpConfirmCapture: 'Confirm capture',
    overlayHelpCancel: 'Cancel',
};

export function t(messageName: string): string {
    const chromeApi = (globalThis as unknown as { chrome?: { i18n?: { getMessage?: (name: string) => string } } }).chrome;
    const getMessage = chromeApi?.i18n?.getMessage;
    if (typeof getMessage === 'function') {
        const result = getMessage(messageName);
        if (result) return result;
    }

    return fallbackMessages[messageName] ?? messageName;
}
