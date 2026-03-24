import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

/**
 * Verwijdert output-sessie mappen die ouder zijn dan maxAgeMs (standaard: 1 uur).
 * Wordt aangeroepen via setInterval in server.ts.
 */
export function cleanOldOutputFolders(outputRoot: string, maxAgeMs = 60 * 60 * 1000): void {
    if (!fs.existsSync(outputRoot)) return;

    const now = Date.now();

    try {
        const entries = fs.readdirSync(outputRoot);
        for (const entry of entries) {
            const fullPath = path.join(outputRoot, entry);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                logger.info({ folder: entry }, 'Verouderde output-map opgeruimd');
            }
        }
    } catch (err) {
        logger.error({ err }, 'Fout bij opruimen output-mappen');
    }
}
