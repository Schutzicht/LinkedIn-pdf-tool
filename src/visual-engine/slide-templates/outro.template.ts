import type { Slide } from '../../types';
import { getBlokForSlide, wrapWithBlok } from '../blokken';
import { buildZonesHtml } from './shared';
import { BRAND } from '../../config';

export function renderOutroSlide(_slide: Slide, slideIndex: number): { html: string; templateClass: string } {
    const blok = getBlokForSlide('outro', slideIndex);

    // Outro titel gewikkeld in blok
    const mainContent = wrapWithBlok(blok, `
        <div class="outro-title">DANKJEWEL!</div>
        <div class="outro-spacer"></div>
        <div class="outro-title">MEER VRAGEN?</div>
        <a href="https://${BRAND.text.website}" class="outro-url">${BRAND.text.website}</a>
    `, { opacity: 0.16, padding: 50 });

    const visualHtml = `
        <div class="like-comment-container">
            <div class="like-comment-text">
                Like &<br>comment
            </div>
            <svg class="like-comment-arrow" viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg">
                <path d="M 25 10 L 25 90 M 10 70 L 25 90 L 40 70" />
            </svg>
        </div>`;

    const html = buildZonesHtml({ headerContent: '', mainContent, visualHtml, footerLeft: '', ctaHtml: '' });
    return { html, templateClass: 'template-c' };
}
