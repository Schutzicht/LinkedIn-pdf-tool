import { Router, Request, Response } from 'express';
import { contentProcessor } from '../services';
import { validateGenerate } from '../middleware/validate';
import { logger } from '../utils/logger';

const router = Router();

interface AiGenOptions {
    postLength?: 'kort' | 'medium' | 'lang';
    presetId?: string;
}

router.post('/', validateGenerate, async (req: Request, res: Response) => {
    try {
        const { topic, options } = req.body as { topic: string; options?: AiGenOptions };
        logger.info({ topic, options }, 'Generate request ontvangen');

        const carouselData = await contentProcessor.generateCarousel(topic, options);

        res.json({ success: true, data: carouselData });
    } catch (error) {
        logger.error({ err: error }, 'Generate error');
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Onbekende generatiefout',
        });
    }
});

export default router;
