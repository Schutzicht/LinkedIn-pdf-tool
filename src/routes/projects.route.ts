import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cufgrcufdtzbkqjlrgjr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const OWNER_TOKEN = process.env.OWNER_TOKEN || '';

/**
 * Single-tenant auth: alleen wie OWNER_TOKEN kent mag projecten CRUDden.
 * De token wordt gelezen uit header `x-owner-token` of query `?owner=`.
 * Bij ontbrekende OWNER_TOKEN env → auth uit (dev fallback, logt warning).
 */
let ownerAuthWarned = false;
function requireOwner(req: Request, res: Response, next: NextFunction): void {
    if (!OWNER_TOKEN) {
        if (!ownerAuthWarned) {
            logger.warn('OWNER_TOKEN niet ingesteld — /api/projects is open. Zet env var op Railway.');
            ownerAuthWarned = true;
        }
        next();
        return;
    }
    const headerToken = req.header('x-owner-token') || '';
    const queryToken = typeof req.query.owner === 'string' ? req.query.owner : '';
    const provided = headerToken || queryToken;
    if (provided && provided === OWNER_TOKEN) {
        next();
        return;
    }
    res.status(401).json({ success: false, error: 'Ongeautoriseerd' });
}

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

// Alle project-endpoints vereisen de owner-token
router.use(requireOwner);

// GET /api/projects/verify — check of owner-token klopt (zonder data te lekken)
router.get('/verify', (_req: Request, res: Response) => {
    res.json({ success: true });
});

// GET /api/projects — lijst met alle projecten van de eigenaar
router.get('/', async (_req: Request, res: Response) => {
    try {
        const params = new URLSearchParams({
            select: 'id,access_token,name,topic,preset_id,created_at,updated_at',
            order: 'updated_at.desc',
            limit: '50',
        });
        const result = await supabaseFetch(`linkedin_projects?${params.toString()}`);
        if (!result.ok) {
            const errText = await result.text();
            logger.error({ status: result.status, body: errText }, 'Supabase list fout');
            res.status(500).json({ success: false, error: 'Kon projecten niet laden' });
            return;
        }
        const rows = await result.json() as Array<{
            id: string;
            access_token: string;
            name: string;
            topic: string;
            preset_id: string | null;
            created_at: string;
            updated_at: string;
        }>;
        res.json({
            success: true,
            projects: rows.map(r => ({
                projectId: r.id,
                accessToken: r.access_token,
                name: r.name,
                topic: r.topic,
                presetId: r.preset_id,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            })),
        });
    } catch (error) {
        logger.error({ err: error }, 'Project list error');
        res.status(500).json({ success: false, error: 'Serverfout bij lijst laden' });
    }
});

// DELETE /api/projects/:id — project verwijderen
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const idParse = uuid.safeParse(req.params.id);
        if (!idParse.success) {
            res.status(400).json({ success: false, error: 'Ongeldige project id' });
            return;
        }
        const id = idParse.data;
        const params = new URLSearchParams({ id: `eq.${id}` });
        const result = await supabaseFetch(`linkedin_projects?${params.toString()}`, {
            method: 'DELETE',
        });
        if (!result.ok) {
            const errText = await result.text();
            logger.error({ status: result.status, body: errText }, 'Supabase delete fout');
            res.status(500).json({ success: false, error: 'Kon project niet verwijderen' });
            return;
        }
        logger.info({ projectId: id }, 'Project verwijderd');
        res.json({ success: true });
    } catch (error) {
        logger.error({ err: error }, 'Project delete error');
        res.status(500).json({ success: false, error: 'Serverfout bij verwijderen' });
    }
});

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
