import type { Slide } from '../../types';
import { getBlokForSlide, wrapWithBlok } from '../blokken';
import { buildZonesHtml } from './shared';
import { formatBody, buildHeaderHtml } from '../../utils/format';
import { escapeHtml } from '../../utils/sanitize';

export function renderEngagementSlide(slide: Slide, slideIndex: number): { html: string; templateClass: string } {
    const blok = getBlokForSlide('engagement', slideIndex);

    const headerContent = buildHeaderHtml(slide);

    // Titel gewikkeld in blok als abstracte button
    const titleHtml = slide.content.title
        ? wrapWithBlok(blok, `<h1>${escapeHtml(slide.content.title)}</h1>`, { opacity: 0.18, padding: 25 })
        : '';

    let mainContent = titleHtml;
    if (slide.content.body) {
        mainContent += `<div class="body-text">${formatBody(slide.content.body)}</div>`;
    }

    const footerLeft = slide.content.footer
        ? `<div class="citation-text">${escapeHtml(slide.content.footer)}</div>`
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
