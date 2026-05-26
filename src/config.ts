import dotenv from 'dotenv';
dotenv.config();

// ============================================================
// WIDEA BRAND CONFIGURATIE — Gebaseerd op stijlboek 2025
// ============================================================

export const BRAND = {
    colors: {
        primary: '#3D2E32',     // Grijs 1 (Black 5C) — donkere tekst/achtergrond
        secondary: '#0081C6',   // Process Blue C — handtekening Widea blauw
        accent: '#BF6A01',      // Aardrood — accent / highlights
        grey2: '#56565A',       // Pantone Cool Grey 11C
        grey3: '#989798',       // Pantone Cool Grey 7C
        grey4: '#D0CFCC',       // Pantone Cool Grey 2C — lichte achtergrond
        black: '#000000',
        paper: '#F6F6F6',       // Papier kleur voor slides
        background: '#E5E5E5',  // Canvas achtergrond
    },
    fonts: {
        main: '"Verb", "Segoe UI", Helvetica, Arial, sans-serif',
        accent: '"Caveat", cursive',
    },
    layout: {
        canvasWidth: 1080,
        canvasHeight: 1080,
        padding: 50,
    },
    text: {
        website: 'www.businessverbeteraars.nl',
        brand: 'Business Verbeteraars',
    },
    images: {
        logo: '/assets/logo.svg',
    },
} as const;

export const CONFIG = {
    // Primary: Claude (Anthropic) — sterkste in schrijfstijl-overname uit kennisbank
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        // Default Opus 4.7. Voor kosten-optimalisatie kan dit naar
        // 'claude-sonnet-4-6' (5x goedkoper) of 'claude-haiku-4-5' (15x goedkoper).
        model: process.env.ANTHROPIC_MODEL || 'claude-opus-4-7',
        maxTokens: 4096,
    },
    // Fallback 1: Gemini
    ai: {
        apiKey: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '',
        model: process.env.AI_MODEL || 'gemini-2.0-flash-lite',
        temperature: 0.7,
    },
    // Fallback 2: Groq (laatste redmiddel)
    groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        // Max chars voor input — moet ruim onder TPM limiet blijven
        // 12k TPM ≈ 36k chars, we houden 18k aan om buffer te hebben voor output
        maxInputChars: 18000,
    },
} as const;
