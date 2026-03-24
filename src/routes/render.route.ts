import { Router, Request, Response } from 'express';
import * as path from 'path';
import { renderer } from '../services';
import { validateRender } from '../middleware/validate';
import { CONFIG } from '../config';
import type { Slide } from '../types';
import { logger } from '../utils/logger';

const router = Router();

router.post('/', validateRender, async (req: Request, res: Response) => {
    try {
        const { slides } = req.body as { slides: Slide[] };
        logger.info({ slideCount: slides.length }, 'Render request ontvangen');

        const outputDir = path.join(CONFIG.paths.output, `session-${Date.now()}`);
        await renderer.renderCarousel({ slides }, outputDir);

        const relativePath = path.relative(CONFIG.paths.output, outputDir);
        const imageUrls = slides.map((_: Slide, i: number) => `/output/${relativePath}/slide-${i + 1}.png`);
        const pdfUrl = `/output/${relativePath}/carousel.pdf`;

        res.json({ success: true, data: { slides }, images: imageUrls, pdfUrl });
    } catch (error) {
        logger.error({ err: error }, 'Render error');
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Onbekende renderfout',
        });
    }
});

export default router;
