import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cufgrcufdtzbkqjlrgjr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';

async function supabaseFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': options.method === 'POST' ? 'return=representation' : 'return=representation',
            ...options.headers as Record<string, string>,
        },
    });
    return res;
}

// POST /api/projects — nieuw project opslaan
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, topic, carouselData, postBody, slideObjects, options, presetId } = req.body;

        if (!carouselData) {
            res.status(400).json({ success: false, error: 'carouselData is verplicht' });
        }

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
        }

        const rows = await result.json() as Array<{ id: string; access_token: string; created_at: string }>;
        const project = rows[0];

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
        const { id } = req.params;
        const { accessToken, name, topic, carouselData, postBody, slideObjects, options, presetId } = req.body;

        if (!accessToken) {
            res.status(401).json({ success: false, error: 'accessToken ontbreekt' });
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (topic !== undefined) updateData.topic = topic;
        if (carouselData !== undefined) updateData.carousel_data = carouselData;
        if (postBody !== undefined) updateData.post_body = postBody;
        if (slideObjects !== undefined) updateData.slide_objects = slideObjects;
        if (options !== undefined) updateData.options = options;
        if (presetId !== undefined) updateData.preset_id = presetId;

        const result = await supabaseFetch(
            `linkedin_projects?id=eq.${id}&access_token=eq.${accessToken}`,
            {
                method: 'PATCH',
                body: JSON.stringify(updateData),
            }
        );

        if (!result.ok) {
            const errText = await result.text();
            logger.error({ status: result.status, body: errText }, 'Supabase update fout');
            res.status(500).json({ success: false, error: 'Kon project niet updaten' });
        }

        const rows = await result.json() as Array<{ id: string }>;
        if (rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project niet gevonden of verkeerde token' });
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
        const { id } = req.params;
        const token = req.query.token as string;

        if (!token) {
            res.status(401).json({ success: false, error: 'token ontbreekt' });
        }

        const result = await supabaseFetch(
            `linkedin_projects?id=eq.${id}&access_token=eq.${token}&select=*`
        );

        if (!result.ok) {
            res.status(500).json({ success: false, error: 'Kon project niet laden' });
        }

        const rows = await result.json() as Array<Record<string, unknown>>;
        if (rows.length === 0) {
            res.status(404).json({ success: false, error: 'Project niet gevonden' });
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

// GET /api/projects — lijst van recente projecten (voor "Mijn projecten")
router.get('/', async (_req: Request, res: Response) => {
    try {
        const result = await supabaseFetch(
            'linkedin_projects?select=id,name,topic,preset_id,created_at,updated_at&order=updated_at.desc&limit=50'
        );

        if (!result.ok) {
            res.status(500).json({ success: false, error: 'Kon projecten niet laden' });
        }

        const rows = await result.json();
        res.json({ success: true, projects: rows });
    } catch (error) {
        logger.error({ err: error }, 'Project list error');
        res.status(500).json({ success: false, error: 'Serverfout' });
    }
});

export default router;
