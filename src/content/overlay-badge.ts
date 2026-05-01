interface BadgeTextParams {
    selector: string;
    width: number;
    height: number;
    parentIndex: number;
    parentStackLength: number;
    expandTop: number;
    expandRight: number;
    expandBottom: number;
    expandLeft: number;
}

interface BadgePositionParams {
    rectLeft: number;
    rectTop: number;
    rectBottom: number;
    rectWidth: number;
    badgeWidth: number;
    badgeHeight: number;
    viewportWidth: number;
    viewportHeight: number;
}

interface BadgePosition {
    top: number;
    left: number;
}

export function buildBadgeText(params: BadgeTextParams): string {
    const sizeText = `${Math.round(params.width)} × ${Math.round(params.height)}`;

    const depthText = params.parentIndex > 0
        ? ` [${params.parentIndex}/${params.parentStackLength - 1}]`
        : '';

    const expandParts: string[] = [];
    if (params.expandTop > 0) expandParts.push(`↑${params.expandTop}`);
    if (params.expandRight > 0) expandParts.push(`→${params.expandRight}`);
    if (params.expandBottom > 0) expandParts.push(`↓${params.expandBottom}`);
    if (params.expandLeft > 0) expandParts.push(`←${params.expandLeft}`);

    const expandText = expandParts.length > 0 ? ` ${expandParts.join(' ')}` : '';

    return `${params.selector}  ${sizeText}${depthText}${expandText}  (↵)`;
}

export function calculateBadgePosition(params: BadgePositionParams): BadgePosition {
    const preferredLeft = params.rectLeft + (params.rectWidth - params.badgeWidth) / 2;

    const topAbove = params.rectTop - params.badgeHeight - 4;
    let top: number;

    if (topAbove >= 0) {
        top = topAbove;
    } else {
        const topBelow = params.rectBottom + 4;
        if (topBelow + params.badgeHeight <= params.viewportHeight) {
            top = topBelow;
        } else {
            top = params.viewportHeight * 0.382;
        }
    }

    const left = Math.max(8, Math.min(preferredLeft, params.viewportWidth - params.badgeWidth - 8));

    return { top, left };
}
