import { escapeHtml } from './sanitize';
import type { Slide } from '../types';

/**
 * Formatteert slide body-tekst naar veilige HTML.
 * - Escaped alle HTML speciale tekens
 * - Herstelt *bold* markdown naar <strong> tags
 * - Zet \n om naar <br>
 */
export function formatBody(body: string): string {
    return escapeHtml(body)
        .replace(/\n/g, '<br>')
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
}

/**
 * Bouwt het header-zone HTML blok voor een slide.
 */
export function buildHeaderHtml(slide: Slide): string {
    if (!slide.content.subtitle) return '';
    return `<div class="header-text">${escapeHtml(slide.content.subtitle)}</div>`;
}
