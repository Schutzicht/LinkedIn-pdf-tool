import express from 'express';
import * as path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initServices, renderer } from './services';
import { CONFIG } from './config';
import { cleanOldOutputFolders } from './utils/cleanup';
import { logger } from './utils/logger';
import generateRoute from './routes/generate.route';
import renderRoute from './routes/render.route';
import debugRoute from './routes/debug.route';

const app = express();
const port = process.env.PORT || 3000;

// --- Reverse Proxy (Railway, Render, etc.) ---
app.set('trust proxy', 1);

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: false, // Puppeteer-generated content needs inline styles
}));
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : ['http://localhost:3000'];
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
}));

// --- Rate Limiting ---
const generateLimiter = rateLimit({
    windowMs: 60_000,  // 1 minuut
    max: 5,            // max 5 generate requests per minuut
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { success: false, error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' },
});

// --- Body Parsing ---
app.use(express.json());

// --- Static Files ---
app.use(express.static(path.join(__dirname, '../public')));
app.use('/output', express.static(CONFIG.paths.output));

// --- Routes ---
app.use('/api/generate', generateLimiter, generateRoute);
app.use('/api/render', renderRoute);
app.use('/api', debugRoute);

// --- Health check (toont of env vars goed staan) ---
app.get('/api/health', (_req, res) => {
    const key = CONFIG.ai.apiKey;
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
        status: 'ok',
        nodeEnv: process.env.NODE_ENV || 'development',
        // API key details alleen zichtbaar in development
        ...(isDev && {
            apiKeyPresent: !!key,
            apiKeyLength: key ? key.length : 0,
            apiKeyPrefix: key ? key.substring(0, 8) + '...' : 'MISSING',
        }),
    });
});

// --- Cleanup interval (elke 10 min i.p.v. per-request) ---
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const cleanupTimer = setInterval(() => {
    cleanOldOutputFolders(CONFIG.paths.output);
}, CLEANUP_INTERVAL_MS);

// --- Start ---
initServices().then(() => {
    const server = app.listen(port, () => {
        logger.info({ port, env: process.env.NODE_ENV || 'development' }, 'Server gestart');
    });

    // --- Graceful Shutdown ---
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutdown signaal ontvangen');
        clearInterval(cleanupTimer);

        server.close(async () => {
            await renderer.close();
            logger.info('Server afgesloten');
            process.exit(0);
        });

        // Forceer afsluiting na 10 seconden
        setTimeout(() => {
            logger.error('Forceer afsluiting na timeout');
            process.exit(1);
        }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err: unknown) => {
    logger.fatal({ err }, 'Initialisatie mislukt');
    process.exit(1);
});
