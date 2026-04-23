/**
 * Gedeelde service-instanties — wordt eenmalig geïnitialiseerd bij server-start.
 * Routes importeren deze singletons in plaats van eigen instanties aan te maken.
 */
import { ContentProcessor } from './content-engine/processor';
import { logger } from './utils/logger';

export const contentProcessor = new ContentProcessor();

export async function initServices(): Promise<void> {
    logger.info('Services ready');
}
