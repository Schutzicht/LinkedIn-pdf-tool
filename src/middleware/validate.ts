import { Request, Response, NextFunction } from 'express';

export function validateGenerate(req: Request, res: Response, next: NextFunction): void {
    const { topic } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Veld "topic" is verplicht.' });
        return;
    }

    if (topic.trim().length > 500) {
        res.status(400).json({ success: false, error: 'Veld "topic" mag maximaal 500 tekens bevatten.' });
        return;
    }

    next();
}
