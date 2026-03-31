import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger';

let logoDataUri: string = '';

/**
 * Laadt het lokale logo SVG en zet het om naar een base64 data URI.
 * Moet aangeroepen worden tijdens server-initialisatie (initServices).
 * Puppeteer kan geen relatieve URLs resolven vanuit setContent(),
 * dus gebruiken we een data URI als fallback.
 */
export async function initLogo(): Promise<void> {
    const logoPath = path.resolve(__dirname, '../../public/assets/logo.svg');
    try {
        const svgContent = await fs.readFile(logoPath, 'utf8');
        logoDataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
        logger.info('Logo geladen als data URI');
    } catch {
        logger.warn('Logo bestand niet gevonden, valt terug op externe URL');
        logoDataUri = 'https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg';
    }
}

export function getLogoDataUri(): string {
    return logoDataUri;
}
