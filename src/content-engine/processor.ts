import type { CarouselData, Slide } from '../types';
import { BRAND, CONFIG } from '../config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class ContentProcessor {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        if (!CONFIG.ai.apiKey) {
            console.warn("API Key not found in environment variables. Set GEMINI_API_KEY or OPENAI_API_KEY in .env");
        }
        this.genAI = new GoogleGenerativeAI(CONFIG.ai.apiKey || '');
        this.model = this.genAI.getGenerativeModel({ model: CONFIG.ai.model });
    }

    async generateCarousel(topic: string): Promise<CarouselData> {
        console.log("Processing input with AI:", topic);
        console.log("Using model:", CONFIG.ai.model);
        console.log("API Key present:", !!CONFIG.ai.apiKey);

        if (!CONFIG.ai.apiKey) {
            throw new Error("Missing API Key");
        }

        const prompt = `
            You are Jeroen from Business Verbeteraars. You write LinkedIn carousels that are critical, conversational, and provoke thought.
            
            **TONE OF VOICE:**
            - **Language**: Dutch (Netherlands).
            - **Style**: Direct, personal ("jij/jouw"), slightly provocative but professional.
            - **Formatting**: Short, punchy sentences. Use "..." for pauses.
            - **Vocabulary**: Playful compound words (like "stilstandliefhebbers", "durfvermijders").
            - **Structure**: Start with a question/statement, challenging the status quo, then ask the reader for their view.
            
            **TOPIC:** "${topic}"
            
            **REQUIRED STRUCTURE (JSON ONLY):**
            {
                "title": "Internal Title",
                "slides": [
                    {
                        "type": "intro",
                        "id": "slide-1",
                        "content": {
                            "subtitle": "~~~ DE VRAAG VAN VANDAAG ~~~",
                            "title": "A provocative hook/question about the topic",
                            "cta": "Klik hier"
                        },
                        "visuals": { "style": "clean" }
                    },
                    {
                        "type": "content",
                        "id": "slide-2",
                        "content": {
                            "body": "State the common belief or statistic (e.g. 'Onderzoekers zeggen...'). Keep it factual but set up the twist.",
                            "footer": "Bron: [Optional source]"
                        }
                    },
                    {
                        "type": "content",
                        "id": "slide-3",
                        "content": {
                            "body": "Challenge it. 'En dat is foute boel, toch?' or 'Is dat wel zo?'. unique perspective."
                        }
                    },
                    {
                        "type": "content",
                        "id": "slide-4",
                        "content": {
                            "body": "The core insight or reframing. Use the playful vocabulary here if possible."
                        }
                    },
                     {
                        "type": "engagement",
                        "id": "slide-5",
                        "content": {
                            "body": "Ask the reader directly: 'Wat is jouw antwoord op de vraag: ...?'",
                            "cta": "Like & comment"
                        }
                    },
                    {
                        "type": "outro",
                        "id": "slide-6",
                        "content": {
                            "title": "DANKJEWEL!",
                            "subtitle": "MEER VRAGEN?",
                            "body": "${BRAND.text.website}",
                            "cta": "Connect"
                        }
                    }
                ],
                "metadata": {
                    "author": "Jeroen",
                    "date": "${new Date().toISOString()}"
                }
            }
        `;

        try {
            console.log("Sending prompt to AI...");
            const result = await this.model.generateContent(prompt);
            console.log("AI response received. Processing...");
            const response = await result.response;
            const text = response.text();

            // Clean up code blocks if present
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();

            const data: CarouselData = JSON.parse(jsonStr);
            return data;
        } catch (error) {
            console.error("AI Generation failed:", error);
            throw error;
        }
    }
}
