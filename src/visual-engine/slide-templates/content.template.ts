import type { Slide } from '../../types';
import { getBlokForSlide, wrapWithBlok } from '../blokken';
import { buildZonesHtml } from './shared';
import { formatBody, buildHeaderHtml } from '../../utils/format';
import { escapeHtml } from '../../utils/sanitize';

export function renderContentSlide(slide: Slide, slideIndex: number): { html: string; templateClass: string } {
    const blok = getBlokForSlide('content', slideIndex);

    const headerContent = buildHeaderHtml(slide);

    // Titel gewikkeld in blok als abstracte button
    const titleHtml = slide.content.title
        ? wrapWithBlok(blok, `<h1>${escapeHtml(slide.content.title)}</h1>`, { opacity: 0.15, padding: 25 })
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
