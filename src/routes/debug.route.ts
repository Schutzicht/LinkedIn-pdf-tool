import { Router, Request, Response } from 'express';
import { CONFIG } from '../config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

const router = Router();

// Alleen beschikbaar buiten productie
if (process.env.NODE_ENV !== 'production') {
    router.get('/test-ai', async (_req: Request, res: Response) => {
        try {
            const key = CONFIG.ai.apiKey;
            const modelName = CONFIG.ai.model;

            const debugInfo = {
                envApiKeyPresent: !!process.env.GEMINI_API_KEY,
                configApiKeyPresent: !!key,
                modelConfigured: modelName,
                testTime: new Date().toISOString(),
            };

            if (!key) throw new Error('API Key ontbreekt in de configuratie');

            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: modelName });

            const result = await model.generateContent("Test connection. Reply with 'OK'.");
            const response = result.response;
            const text = response.text();

            res.json({ success: true, message: 'AI Verbinding succesvol', response: text, debug: debugInfo });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Onbekende fout';
            logger.error({ err: error }, 'AI test mislukt');
            res.status(500).json({ success: false, error: message });
        }
    });

    logger.info('Debug routes geladen (niet-productie modus)');
}

export default router;
