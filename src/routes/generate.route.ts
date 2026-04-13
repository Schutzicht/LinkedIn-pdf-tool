import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { contentProcessor, renderer } from '../services';
import { validateGenerate } from '../middleware/validate';
import { CONFIG } from '../config';
import type { Slide } from '../types';
import { logger } from '../utils/logger';

const router = Router();

interface AiGenOptions {
    postLength?: 'kort' | 'medium' | 'lang';
}

router.post('/', validateGenerate, async (req: Request, res: Response) => {
    try {
        const { topic, options } = req.body as { topic: string; options?: AiGenOptions };
        logger.info({ topic, options }, 'Generate request ontvangen');

        const carouselData = await contentProcessor.generateCarousel(topic, options);

        const outputDir = path.join(CONFIG.paths.output, `session-${randomUUID()}`);
        await renderer.renderCarousel(carouselData, outputDir);

        const relativePath = path.relative(CONFIG.paths.output, outputDir);
        const imageUrls = carouselData.slides.map((_: Slide, i: number) => `/output/${relativePath}/slide-${i + 1}.png`);
        const pdfUrl = `/output/${relativePath}/carousel.pdf`;

        res.json({ success: true, data: carouselData, images: imageUrls, pdfUrl });
    } catch (error) {
        logger.error({ err: error }, 'Generate error');
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Onbekende generatiefout',
        });
    }
});

export default router;
