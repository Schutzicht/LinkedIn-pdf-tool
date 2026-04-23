import express from 'express';
import * as path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initServices } from './services';
import { logger } from './utils/logger';
import generateRoute from './routes/generate.route';
import debugRoute from './routes/debug.route';
import projectsRoute from './routes/projects.route';

const app = express();
const port = process.env.PORT || 3000;

// --- Reverse Proxy (Railway, Render, etc.) ---
app.set('trust proxy', 1);

// --- Security Middleware ---
app.use(helmet({
    contentSecurityPolicy: false, // canvas editor gebruikt inline styles
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

const projectsLimiter = rateLimit({
    windowMs: 60_000,
    max: 60,            // 60 project-calls per minuut (ruim voor edit-flow met autosave)
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    message: { success: false, error: 'Te veel verzoeken op projecten.' },
});

// --- Body Parsing ---
app.use(express.json({ limit: '10mb' }));

// --- Static Files ---
app.use(express.static(path.join(__dirname, '../public')));

// --- Routes ---
app.use('/api/generate', generateLimiter, generateRoute);
app.use('/api/projects', projectsLimiter, projectsRoute);
app.use('/api', debugRoute);

// --- Health check (toont of env vars goed staan) ---
app.get('/api/health', (_req, res) => {
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
        status: 'ok',
        nodeEnv: process.env.NODE_ENV || 'development',
        ...(isDev && {
            geminiKeyPresent: !!process.env.GEMINI_API_KEY,
            groqKeyPresent: !!process.env.GROQ_API_KEY,
            supabaseKeyPresent: !!process.env.SUPABASE_ANON_KEY,
        }),
    });
});

// --- Start ---
initServices().then(() => {
    const server = app.listen(port, () => {
        logger.info({ port, env: process.env.NODE_ENV || 'development' }, 'Server gestart');
    });

    // --- Graceful Shutdown ---
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutdown signaal ontvangen');

        server.close(() => {
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
