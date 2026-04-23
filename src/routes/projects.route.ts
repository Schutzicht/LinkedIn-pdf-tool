import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cufgrcufdtzbkqjlrgjr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID_REGEX, 'Ongeldige id');
const accessToken = z.string().min(8).max(200);

const projectBodySchema = z.object({
    name: z.string().max(200).optional(),
    topic: z.string().max(500).optional(),
    carouselData: z.record(z.unknown()),
    postBody: z.string().max(10000).optional(),
    slideObjects: z.unknown().optional(),
    options: z.record(z.unknown()).optional(),
    presetId: z.string().max(100).nullable().optional(),
});

const projectUpdateSchema = projectBodySchema.partial().extend({
    accessToken,
});

async function supabaseFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
            ...options.headers as Record<string, string>,
        },
    });
    return res;
}

// POST /api/projects — nieuw project opslaan
router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = projectBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                success: false,
                error: 'Ongeldige invoer',
                details: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
            });
            return;
        }

        const { name, topic, carouselData, postBody, slideObjects, options, presetId } = parsed.data;

        const result = await supabaseFetch('linkedin_projects', {
            method: 'POST',
            body: JSON.stringify({
                name: name || topic?.slice(0, 60) || 'Naamloos project',
                topic: topic || '',
                carousel_data: carouselData,
                post_body: postBody || '',
                slide_objects: slideObjects || null,
                options: options || {},
                preset_id: presetId || null,
            }),
        });

        if (!result.ok) {
            const errText = await result.text();
            logger.error({ status: result.status, body: errText }, 'Supabase save fout');
            res.status(500).json({ success: false, error: 'Kon project niet opslaan' });
            return;
        }

        const rows = await result.json() as Array<{ id: string; access_token: string; created_at: string }>;
        const project = rows[0];

        if (!project) {
            logger.error('Supabase insert gaf geen rij terug');
            res.status(500).json({ success: false, error: 'Kon project niet opslaan' });
            return;
        }

        logger.info({ projectId: project.id }, 'Project opgeslagen');
        res.json({
            success: true,
            projectId: project.id,
            accessToken: project.access_token,
        });
    } catch (error) {
        logger.error({ err: error }, 'Project save error');
        res.status(500).json({ success: false, error: 'Serverfout bij opslaan' });
    }
});

// PUT /api/projects/:id — bestaand project updaten
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const idParse = uuid.safeParse(req.params.id);
        if (!idParse.success) {
            res.status(400).json({ success: false, error: 'Ongeldige project id' });
            return;
        }
        const id = idParse.data;

        const parsed = projectUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                success: false,
                error: 'Ongeldige invoer',
                details: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
            });
            return;
        }

        const body = parsed.data;
        const updateData: Record<string, unknown> = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.topic !== undefined) updateData.topic = body.topic;
        if (body.carouselData !== undefined) updateData.carousel_data = body.carouselData;
        if (body.postBody !== undefined) updateData.post_body = body.postBody;
        if (body.slideObjects !== undefined) updateData.slide_objects = body.slideObjects;
        if (body.options !== undefined) updateData.options = body.options;
        if (body.presetId !== undefined) updateData.preset_id = body.presetId;

        const params = new URLSearchParams({
            id: `eq.${id}`,
            access_token: `eq.${body.accessToken}`,
        });

        const result = await supabaseFetch(`linkedin_projects?${params.toString()}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData),
        });

        if (!result.ok) {
            const errText = await result.text();
            logger.error({ status: result.status, body: errText }, 'Supabase update fout');
            res.status(500).json({ success: false, error: 'Kon project niet updaten' });
            return;
        }

        const rows = await result.json() as Array<{ id: string }>;
        if (rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project niet gevonden of verkeerde token' });
            return;
        }

        logger.info({ projectId: id }, 'Project geüpdatet');
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Project update error');
        res.status(500).json({ success: false, error: 'Serverfout bij updaten' });
    }
});

// GET /api/projects/:id?token=xxx — project ophalen
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const idParse = uuid.safeParse(req.params.id);
        if (!idParse.success) {
            res.status(400).json({ success: false, error: 'Ongeldige project id' });
            return;
        }
        const id = idParse.data;

        const tokenParse = accessToken.safeParse(req.query.token);
        if (!tokenParse.success) {
            res.status(401).json({ success: false, error: 'token ontbreekt of is ongeldig' });
            return;
        }
        const token = tokenParse.data;

        const params = new URLSearchParams({
            id: `eq.${id}`,
            access_token: `eq.${token}`,
            select: '*',
        });

        const result = await supabaseFetch(`linkedin_projects?${params.toString()}`);

        if (!result.ok) {
            res.status(500).json({ success: false, error: 'Kon project niet laden' });
            return;
        }

        const rows = await result.json() as Array<Record<string, unknown>>;
        if (rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project niet gevonden' });
            return;
        }

        const row = rows[0];
        res.json({
            success: true,
            project: {
                id: row.id,
                name: row.name,
                topic: row.topic,
                carouselData: row.carousel_data,
                postBody: row.post_body,
                slideObjects: row.slide_objects,
                options: row.options,
                presetId: row.preset_id,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    } catch (error) {
        logger.error({ err: error }, 'Project load error');
        res.status(500).json({ success: false, error: 'Serverfout bij laden' });
    }
});

export default router;
