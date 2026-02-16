import dotenv from 'dotenv';
dotenv.config();

// Brand Configuration
// Placeholder values - To be updated with exact Widea specs

export const BRAND = {
    colors: {
        primary: '#10366b', // Dark Blue from website
        secondary: '#00aec7', // Cyan from logo/accents
        accent: '#f36b00', // Orange from buttons
        text: '#1A1A1A', // Dark Grey/Black
        background: '#F5F5F5', // Light background
        paper: '#FFFFFF', // The 'sheet' color
    },
    fonts: {
        main: '"Verb", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        highlight: '"Verb", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    },
    layout: {
        width: 1080,
        height: 1080, // Square format (was 2048)
        padding: 50
    },
    text: {
        website: 'www.businessverbeteraars.nl'
    },
    images: {
        logo: 'https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg'
    }
};

export const CONFIG = {
    ai: {
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-1.5-flash',
        temperature: 0.7
    }
};
