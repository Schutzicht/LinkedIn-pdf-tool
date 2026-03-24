import type { CarouselData } from '../types';
import { CONFIG } from '../config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { buildCarouselPrompt } from './prompts/carousel.prompt';
import { logger } from '../utils/logger';
import { z } from 'zod';

// --- Zod schema voor AI response validatie ---
const SlideContentSchema = z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    subtitle: z.string().optional(),
    footer: z.string().optional(),
    cta: z.string().optional(),
    imageKeyword: z.string().optional(),
});

const SlideSchema = z.object({
    type: z.enum(['intro', 'content', 'engagement', 'outro'] as const),
    id: z.string(),
    content: SlideContentSchema,
    visuals: z.object({
        icon: z.string().optional(),
        backgroundImage: z.string().optional(),
        style: z.string().optional(),
    }).optional(),
});

const CarouselSchema = z.object({
    title: z.string(),
    topic: z.string(),
    postBody: z.string(),
    slides: z.array(SlideSchema).min(1),
    metadata: z.object({
        author: z.string(),
        date: z.string(),
    }),
});

export class ContentProcessor {
    private model: GenerativeModel;
    private kennisbankPath: string;
    private kennisbankCache: string | null = null;

    constructor() {
        if (!CONFIG.ai.apiKey) {
            logger.warn('GEMINI_API_KEY ontbreekt in de omgevingsvariabelen. Stel deze in via .env');
        }
        const genAI = new GoogleGenerativeAI(CONFIG.ai.apiKey);
        this.model = genAI.getGenerativeModel({ model: CONFIG.ai.model });
        this.kennisbankPath = path.join(__dirname, 'jeroen-kennisbank.txt');
    }

    private async getKennisbankContent(): Promise<string> {
        if (this.kennisbankCache) return this.kennisbankCache;

        try {
            this.kennisbankCache = await fs.readFile(this.kennisbankPath, 'utf8');
            return this.kennisbankCache;
        } catch {
            logger.warn('Kennisbank bestand niet gevonden, doorgaan zonder referentiemateriaal.');
            return 'Geen referentie materiaal gevonden.';
        }
    }

    async generateCarousel(topic: string): Promise<CarouselData> {
        logger.info({ topic, model: CONFIG.ai.model }, 'Carousel genereren');

        if (!CONFIG.ai.apiKey) {
            throw new Error('API Key ontbreekt — stel GEMINI_API_KEY in via .env');
        }

        const kennisbank = await this.getKennisbankContent();
        const prompt = buildCarouselPrompt(topic, kennisbank);

        try {
            logger.debug('Prompt naar AI gestuurd...');
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            // Verwijder eventuele code-block markers
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Valideer met Zod schema
            const validated = CarouselSchema.safeParse(parsed);
            if (!validated.success) {
                logger.error({ errors: validated.error.issues }, 'AI response voldoet niet aan schema');
                throw new Error(`AI response validatie mislukt: ${validated.error.issues.map(i => i.message).join(', ')}`);
            }

            return validated.data as CarouselData;
        } catch (error) {
            logger.error({ err: error }, 'AI-generatie mislukt');
            throw error;
        }
    }
}
