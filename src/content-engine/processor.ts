import type { CarouselData } from '../types';
import { CONFIG } from '../config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { buildPresetSelectionPrompt, buildPresetFillPrompt } from './prompts/preset.prompt';
import presetsData from './presets.json';
import { logger } from '../utils/logger';
import { z } from 'zod';

export interface GenerateOptions {
    postLength?: 'kort' | 'medium' | 'lang';
}

// --- Zod schema voor AI response validatie ---
const SlideContentSchema = z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    subtitle: z.string().optional(),
    footer: z.string().optional(),
    cta: z.string().optional(),
    imageKeyword: z.string().optional(),
    blokken: z.array(z.string()).min(2).max(5).optional(),
});

const VisualsSchema = z.object({
    icon: z.string().optional(),
    backgroundImage: z.string().optional(),
    style: z.string().optional(),
    layout: z.string().optional(),
}).passthrough();

const DecorationSchema = z.object({
    type: z.string(),
}).passthrough();

// Per-type validatie via discriminatedUnion
const SlideSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('intro'),
        id: z.string(),
        content: SlideContentSchema.required({ title: true }),
        visuals: VisualsSchema.optional(),
        decorations: z.array(DecorationSchema).optional(),
    }),
    z.object({
        type: z.literal('content'),
        id: z.string(),
        content: SlideContentSchema.required({ body: true }),
        visuals: VisualsSchema.optional(),
        decorations: z.array(DecorationSchema).optional(),
    }),
    z.object({
        type: z.literal('engagement'),
        id: z.string(),
        content: SlideContentSchema.required({ body: true }),
        visuals: VisualsSchema.optional(),
        decorations: z.array(DecorationSchema).optional(),
    }),
    z.object({
        type: z.literal('outro'),
        id: z.string(),
        content: SlideContentSchema.required({ title: true }),
        visuals: VisualsSchema.optional(),
        decorations: z.array(DecorationSchema).optional(),
    }),
]);

const CarouselSchema = z.object({
    title: z.string(),
    topic: z.string(),
    postBody: z.string(),
    slides: z.array(SlideSchema).min(4).max(8),
    metadata: z.object({
        author: z.string(),
        date: z.string(),
    }).passthrough(),
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

    /**
     * Roep AI aan met automatische fallback naar Groq als Gemini faalt.
     * Probeert eerst Gemini; bij elke fout (rate limit, server error, etc.)
     * valt het terug op Groq als die geconfigureerd is.
     */
    private async callAI(prompt: string): Promise<string> {
        // Stap 1: probeer Gemini als die geconfigureerd is
        if (CONFIG.ai.apiKey) {
            try {
                const result = await this.model.generateContent(prompt);
                return result.response.text();
            } catch (err) {
                logger.warn({ err: err instanceof Error ? err.message : err }, 'Gemini call mislukt — fallback naar Groq');
                if (!CONFIG.groq.apiKey) {
                    throw err; // geen Groq beschikbaar, gooi originele error
                }
            }
        }

        // Stap 2: fallback naar Groq (OpenAI-compatible API)
        if (!CONFIG.groq.apiKey) {
            throw new Error('Geen AI provider beschikbaar — stel GEMINI_API_KEY of GROQ_API_KEY in via .env');
        }

        // Kap prompt af voor Groq's TPM limiet
        // De grootste kostenpost is de kennisbank — vervang die door een korte stijlsamenvatting
        let groqPrompt = prompt;
        const maxChars = CONFIG.groq.maxInputChars;

        if (prompt.length > maxChars) {
            // Strategie 1: vervang kennisbank door korte stijlnotitie
            const kennisbankShort = 'Schrijf in Jeroens stijl: nuchter, direct, reflectief. Begin met een herkenbare observatie. Gebruik "Nee: ..." om aannames te corrigeren. Mix korte en lange zinnen. Stel retorische vragen. Vermijd clickbait, superlatieven en grof taalgebruik.';
            // Vind kennisbank-block en vervang
            groqPrompt = prompt.replace(
                /\*\*REFERENTIEMATERIAAL[\s\S]*?(?=\n\n\*\*[A-Z])/,
                `**REFERENTIEMATERIAAL — STIJLNOTITIE:**\n${kennisbankShort}\n\n`
            );

            // Strategie 2: als nog steeds te groot, hard afkappen
            if (groqPrompt.length > maxChars) {
                const headSize = 800;
                const tailSize = 1500;
                const middleSize = maxChars - headSize - tailSize - 100;
                const head = groqPrompt.slice(0, headSize);
                const tail = groqPrompt.slice(-tailSize);
                const middle = groqPrompt.slice(headSize, headSize + middleSize);
                groqPrompt = `${head}${middle}\n[...]\n${tail}`;
            }
            logger.warn({ originalLen: prompt.length, truncatedLen: groqPrompt.length }, 'Prompt ingekort voor Groq');
        }

        logger.info({ model: CONFIG.groq.model, promptLen: groqPrompt.length }, 'Groq fallback wordt aangeroepen');
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.groq.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: CONFIG.groq.model,
                messages: [{ role: 'user', content: groqPrompt }],
                temperature: CONFIG.ai.temperature,
                response_format: { type: 'json_object' },
            }),
        });

        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            throw new Error(`Groq API fout: ${groqResponse.status} ${errText}`);
        }

        const groqData = await groqResponse.json() as { choices: Array<{ message: { content: string } }> };
        const text = groqData.choices?.[0]?.message?.content;
        if (!text) {
            throw new Error('Groq response bevatte geen tekst');
        }
        return text;
    }

    async generateCarousel(topic: string, options?: GenerateOptions): Promise<CarouselData> {
        logger.info({ topic, model: CONFIG.ai.model, options }, 'Carousel genereren via preset flow');

        if (!CONFIG.ai.apiKey && !CONFIG.groq.apiKey) {
            throw new Error('Geen API key — stel GEMINI_API_KEY of GROQ_API_KEY in via .env');
        }

        const kennisbank = await this.getKennisbankContent();

        // ── STAP 1: Kies preset + bepaal lamp icoon ──
        const presetSummaries = (presetsData.presets as any[]).map(p => ({
            id: p.id,
            name: p.name,
            useWhen: p.useWhen,
            dontUseWhen: p.dontUseWhen,
            examples: p.examples || [],
        }));

        const selectionPrompt = buildPresetSelectionPrompt(topic, presetSummaries);
        let selectedPresetId = 'reflectie-kort'; // safe default
        let lampIcoon = false;

        try {
            const selectionRaw = await this.callAI(selectionPrompt);
            const selMatch = selectionRaw.match(/\{[\s\S]*\}/);
            if (selMatch) {
                const sel = JSON.parse(selMatch[0]);
                if (sel.presetId && presetSummaries.find(p => p.id === sel.presetId)) {
                    selectedPresetId = sel.presetId;
                }
                lampIcoon = !!sel.lampIcoon;
                logger.info({ selectedPresetId, lampIcoon, reden: sel.reden }, 'Preset gekozen');
            }
        } catch (e) {
            logger.warn({ err: e }, 'Preset selectie mislukt, fallback naar default');
        }

        const preset = (presetsData.presets as any[]).find(p => p.id === selectedPresetId);
        if (!preset) throw new Error(`Preset niet gevonden: ${selectedPresetId}`);

        // ── STAP 2: Vul preset velden in ──
        const fillPrompt = buildPresetFillPrompt(topic, preset, kennisbank, options);

        let lastError: unknown;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                logger.debug({ attempt, preset: selectedPresetId }, 'Preset fill prompt naar AI gestuurd...');
                const text = await this.callAI(fillPrompt);
                const match = text.match(/\{[\s\S]*\}/);
                if (!match) throw new Error('Geen JSON in AI response');

                const parsed = JSON.parse(match[0]);

                // Build full CarouselData with preset structure + AI fills
                const carousel: CarouselData = {
                    title: parsed.title || topic,
                    topic,
                    postBody: parsed.postBody || '',
                    slides: this.mergePresetWithAI(preset, parsed),
                    metadata: {
                        author: 'Jeroen',
                        date: new Date().toISOString(),
                        ...(lampIcoon ? { lampIcoon: true } : {}),
                        presetId: selectedPresetId,
                    } as any,
                };

                // Validate the assembled structure
                const validated = CarouselSchema.safeParse(carousel);
                if (!validated.success) {
                    logger.error({ errors: validated.error.issues }, 'Preset response voldoet niet aan schema');
                    throw new Error(`Validatie mislukt: ${validated.error.issues.map(i => i.message).join(', ')}`);
                }

                return validated.data as CarouselData;
            } catch (error) {
                lastError = error;
                if (attempt < 2) {
                    logger.warn({ err: error, attempt }, 'Preset fill mislukt, opnieuw proberen...');
                    await sleep(RETRY_DELAY_MS);
                }
            }
        }

        logger.error({ err: lastError }, 'Preset generatie mislukt na alle pogingen');
        throw lastError;
    }

    /**
     * Merge AI-generated content into preset slide structure.
     * Preserves preset layout/type/fixed fields, fills AI-marked fields.
     */
    private mergePresetWithAI(preset: any, aiResponse: any): any[] {
        const aiSlides = aiResponse.slides || [];
        return preset.slides.map((presetSlide: any, i: number) => {
            const aiSlide = aiSlides[i] || {};
            const aiContent = aiSlide.content || {};

            // Build content by walking preset definition
            const content: any = {};
            if (presetSlide.content) {
                for (const [key, value] of Object.entries(presetSlide.content)) {
                    if (typeof value === 'string') {
                        if (value === 'fixed-swot') {
                            content.blokken = ['Sterktes', 'Zwaktes', 'Kansen', 'Bedreigingen'];
                        } else if (value === 'fixed-voor-na') {
                            content.blokken = ['Voor', 'Na'];
                        } else if (value.startsWith('fixed-')) {
                            content[key] = value.replace('fixed-', '');
                        } else if (value.startsWith('ai')) {
                            // Use AI-provided value if exists
                            if (aiContent[key] !== undefined) {
                                content[key] = aiContent[key];
                            }
                        } else {
                            // Literal string from preset (e.g. "Les 1")
                            content[key] = value;
                        }
                    }
                }
            }

            // For outro: always use fixed values
            if (presetSlide.type === 'outro') {
                content.title = 'DANKJEWEL!';
                content.subtitle = 'MEER VRAGEN?';
                content.body = 'businessverbeteraars.nl';
                content.cta = 'Connect';
            }

            const slide: any = {
                type: presetSlide.type,
                id: `slide-${i + 1}`,
                content,
            };

            if (presetSlide.layout) {
                slide.visuals = { layout: presetSlide.layout, style: 'cover' };
            }

            // Pass through decorations from preset (arrows, business graphics, etc.)
            if (presetSlide.decorations && Array.isArray(presetSlide.decorations)) {
                slide.decorations = presetSlide.decorations;
            }

            return slide;
        });
    }
}
