/**
 * Gedeelde layout builder voor alle slide templates.
 * Definieert de vaste zone-structuur die elke slide gebruikt.
 */

export interface ZoneParts {
    headerContent: string;
    mainContent: string;
    visualHtml: string;
    footerLeft: string;
    ctaHtml: string;
}

export function buildZonesHtml(parts: ZoneParts): string {
    return `
        <div class="header-zone">${parts.headerContent}</div>
        <div class="main-text-zone">${parts.mainContent}</div>
        <div class="visual-zone">${parts.visualHtml}</div>
        <div class="cta-zone">${parts.ctaHtml}</div>
        <div class="footer-zone">
            <div class="footer-left-content">${parts.footerLeft}</div>
            <div class="footer-right-content">
                <div class="footer-branding">
                    <img src="${getLogoUrl()}" alt="Logo" class="footer-logo-img">
                </div>
            </div>
        </div>
    `;
}

/** Centraliseert de logo URL — importeert BRAND lazy om circulaire deps te voorkomen */
function getLogoUrl(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BRAND } = require('../../config');
    return BRAND.images.logo as string;
}
