/**
 * Gedeelde service-instanties — wordt eenmalig geïnitialiseerd bij server-start.
 * Routes importeren deze singletons in plaats van eigen instanties aan te maken.
 */
import { ContentProcessor } from './content-engine/processor';
import { VisualRenderer } from './visual-engine/renderer';
import { initLogo } from './utils/logo';
import { logger } from './utils/logger';

export const contentProcessor = new ContentProcessor();
export const renderer = new VisualRenderer();

export async function initServices(): Promise<void> {
    await initLogo();
    await renderer.init();
    logger.info('Visual Renderer ready');
}
