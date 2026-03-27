import type { Slide } from '../../types';
import { buildZonesHtml } from './shared';
import { formatBody, buildHeaderHtml } from '../../utils/format';
import { escapeHtml } from '../../utils/sanitize';

export function renderEngagementSlide(slide: Slide, _slideIndex: number): { html: string; templateClass: string } {

    const headerContent = buildHeaderHtml(slide);

    const titleHtml = slide.content.title
        ? `<h1>${escapeHtml(slide.content.title)}</h1>`
        : '';

    let mainContent = titleHtml;
    if (slide.content.body) {
        mainContent += `<div class="body-text">${formatBody(slide.content.body)}</div>`;
    }

    let footerText = slide.content.footer || '';
    if (/business\s*verbeteraars/i.test(footerText)) {
        footerText = '';
    }

    const footerLeft = footerText
        ? `<div class="citation-text">${escapeHtml(footerText)}</div>`
        : '';

    const visualHtml = `
        <div class="like-comment-container" style="bottom: 100px; right: 80px; left: auto;">
            <div class="like-comment-text" style="font-size: 50px;">
                Wat vind<br>jij?
            </div>
        </div>`;

    const html = buildZonesHtml({ headerContent, mainContent, visualHtml, footerLeft, ctaHtml: '' });
    return { html, templateClass: 'template-b' };
}
