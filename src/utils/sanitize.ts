/**
 * Escaped HTML-speciale tekens om XSS te voorkomen.
 * Gebruik dit voor àlle user- of AI-gegenereerde content die in HTML wordt geïnjecteerd.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
