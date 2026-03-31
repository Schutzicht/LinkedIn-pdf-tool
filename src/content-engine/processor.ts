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

// Per-type validatie via discriminatedUnion
const SlideSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('intro'),
        id: z.string(),
        content: SlideContentSchema.required({ title: true }),
        visuals: z.object({ icon: z.string().optional(), backgroundImage: z.string().optional(), style: z.string().optional() }).optional(),
    }),
    z.object({
        type: z.literal('content'),
        id: z.string(),
        content: SlideContentSchema.required({ body: true }),
        visuals: z.object({ icon: z.string().optional(), backgroundImage: z.string().optional(), style: z.string().optional() }).optional(),
    }),
    z.object({
        type: z.literal('engagement'),
        id: z.string(),
        content: SlideContentSchema.required({ body: true }),
        visuals: z.object({ icon: z.string().optional(), backgroundImage: z.string().optional(), style: z.string().optional() }).optional(),
    }),
    z.object({
        type: z.literal('outro'),
        id: z.string(),
        content: SlideContentSchema.required({ title: true }),
        visuals: z.object({ icon: z.string().optional(), backgroundImage: z.string().optional(), style: z.string().optional() }).optional(),
    }),
]);

const CarouselSchema = z.object({
    title: z.string(),
    topic: z.string(),
    postBody: z.string(),
    slides: z.array(SlideSchema).min(4).max(7),
    metadata: z.object({
        author: z.string(),
        date: z.string(),
    }),
});

const RETRY_DELAY_MS = 2_000;

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class ContentProcessor {
    private model: GenerativeModel;
    private kennisbankPath: string;
    private kennisbankCache: string | null = null;

    constructor() {
        if (!CONFIG.ai.apiKey) {
            logger.warn('GEMINI_API_KEY ontbreekt in de omgevingsvariabelen. Stel deze in via .env');
        }
        const genAI = new GoogleGenerativeAI(CONFIG.ai.apiKey);
        this.model = genAI.getGenerativeModel({
            model: CONFIG.ai.model,
            generationConfig: {
                temperature: CONFIG.ai.temperature,
                responseMimeType: 'application/json',
            },
        });
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

    private async callAI(prompt: string): Promise<string> {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
    }

    async generateCarousel(topic: string): Promise<CarouselData> {
        logger.info({ topic, model: CONFIG.ai.model }, 'Carousel genereren');

        if (!CONFIG.ai.apiKey) {
            throw new Error('API Key ontbreekt — stel GEMINI_API_KEY in via .env');
        }

        const kennisbank = await this.getKennisbankContent();
        const prompt = buildCarouselPrompt(topic, kennisbank);

        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                logger.debug({ attempt }, 'Prompt naar AI gestuurd...');
                const text = await this.callAI(prompt);

                // Extraheer JSON robuust — vangt tekst voor/na JSON op
                const match = text.match(/\{[\s\S]*\}/);
                if (!match) {
                    throw new Error('Geen JSON object gevonden in AI response');
                }
                const parsed = JSON.parse(match[0]);

                // Valideer met Zod schema
                const validated = CarouselSchema.safeParse(parsed);
                if (!validated.success) {
                    logger.error({ errors: validated.error.issues }, 'AI response voldoet niet aan schema');
                    throw new Error(`AI response validatie mislukt: ${validated.error.issues.map(i => i.message).join(', ')}`);
                }

                return validated.data as CarouselData;
            } catch (error) {
                lastError = error;
                if (attempt < 2) {
                    logger.warn({ err: error, attempt }, 'AI-generatie mislukt, opnieuw proberen...');
                    await sleep(RETRY_DELAY_MS);
                }
            }
        }

        logger.error({ err: lastError }, 'AI-generatie mislukt na alle pogingen');
        throw lastError;
    }
}
