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

        if (!CONFIG.ai.apiKey) {
            throw new Error("Missing API Key");
        }

        const prompt = `
            You are Jeroen from Business Verbeteraars. You write LinkedIn carousels and posts that are critical, reflective, and provoke thought.
            
            **TONE OF VOICE (STRICT):**
            - **Identity**: Experienced business coach, not a "guru". You challenge the status quo.
            - **Style**: Direct, personal ("jij/jouw"), slightly provocative but professional.
            - **Structure**: Start with a hook/question, pivot to a common misconception, then offer a deeper insight.
            - **Vocabulary**: Use words like "moed" (courage), "wisselvalligheid", "eenvoud". Avoid generic fluff.
            - **Signature**: Often ends with a reflective question or a call to action based on mindset.
            - **Formatting**: Use short paragraphs. Use "..." for pauses. Use "Nee: ..." to correct assumptions.
            
            **TOPIC:** "${topic}"
            
            **REQUIRED STRUCTURE (JSON ONLY):**
            {
                "title": "Internal Title for tracking",
                "topic": "${topic}",
                "postBody": "WRITE THE LINKEDIN POST HERE. Start with a hook. Use the tone described above. Include 3-5 relevant hashtags at the end (e.g. #businessverbeteraars #ondernemen).",
                "slides": [
                    {
                        "type": "intro",
                        "id": "slide-1",
                        "content": {
                            "subtitle": "~~~ DE VRAAG VAN VANDAAG ~~~",
                            "title": "A provocative hook/question about the topic (Short & Punchy). E.g. 'Zijn ondernemers groeiweigeraars?'",
                            "cta": "Swipe voor het antwoord",
                            "imageKeyword": "A single English keyword describing the visual subject (e.g. 'mountain', 'office', 'storm', 'puzzle')."
                        },
                        "visuals": { "style": "cover" }
                    },
                    {
                        "type": "content",
                        "id": "slide-2",
                        "content": {
                            "body": "State the standard belief: 'Onderzoekers zeggen...'. Use data if relevant.",
                            "footer": "Herkenbaar?"
                        }
                    },
                    {
                        "type": "content",
                        "id": "slide-3",
                        "content": {
                            "body": "The Twist: 'En dat is foute boel, toch?' or 'Is dat wel zo?'. Introduces the conflict.",
                            "footer": "Business Verbeteraars"
                        }
                    },
                    {
                        "type": "content",
                        "id": "slide-4",
                        "content": {
                            "body": "The Insight. Use playful words like 'stilstandliefhebbers' or 'durfvermijders' if it fits.",
                            "footer": "Business Verbeteraars"
                        }
                    },
                     {
                        "type": "engagement",
                        "id": "slide-5",
                        "content": {
                            "body": "The Question to the reader: 'Wat is jouw antwoord op de vraag: ...?'",
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
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from response (handles markdown code blocks and preamble text)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("No valid JSON found in AI response");
            }
            return JSON.parse(jsonMatch[0]);
        } catch (error: any) {
            console.error("AI Generation failed:", error);
            throw new Error(`AI fout: ${error.message}`);
        }
    }
}
