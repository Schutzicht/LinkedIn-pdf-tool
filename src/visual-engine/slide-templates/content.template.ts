import type { Slide } from '../../types';
import { buildZonesHtml } from './shared';
import { formatBody, buildHeaderHtml } from '../../utils/format';
import { escapeHtml } from '../../utils/sanitize';

export function renderContentSlide(slide: Slide, _slideIndex: number): { html: string; templateClass: string } {

    const headerContent = buildHeaderHtml(slide);

    const titleHtml = slide.content.title
        ? `<h1>${escapeHtml(slide.content.title)}</h1>`
        : '';

    let mainContent = titleHtml;
    if (slide.content.body) {
        mainContent += `<div class="body-text">${formatBody(slide.content.body)}</div>`;
    }

    const footerLeft = slide.content.footer
        ? `<div class="citation-text">${escapeHtml(slide.content.footer)}</div>`
        : '';

    const html = buildZonesHtml({ headerContent, mainContent, visualHtml: '', footerLeft, ctaHtml: '' });
    return { html, templateClass: 'template-b' };
}
