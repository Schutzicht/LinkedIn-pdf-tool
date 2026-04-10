import type { Slide } from '../../types';
import { buildZonesHtml } from './shared';
import { buildHeaderHtml } from '../../utils/format';
import { escapeHtml } from '../../utils/sanitize';

const BLOK_COLORS = ['#0081C6', '#BF6A01', '#989798', '#0081C6']; // blauw, oranje, grijs, blauw

function buildBlokkenHtml(blokken: string[]): string {
    const count = blokken.length;
    const isGrid = count === 4;

    const containerStyle = isGrid
        ? 'display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 420px; margin: 0 auto;'
        : `display: flex; gap: 24px; justify-content: center; align-items: center;`;

    const blokHtml = blokken.map((label, i) => {
        const color = BLOK_COLORS[i % BLOK_COLORS.length];
        const size = isGrid ? '180px' : '170px';
        return `
            <div style="
                width: ${size}; height: ${size};
                background: ${color};
                border-radius: 50% 45% 50% 45% / 45% 50% 45% 50%;
                display: flex; align-items: center; justify-content: center;
                transform: rotate(${(i % 2 === 0 ? -3 : 3)}deg);
            ">
                <span style="color: #fff; font-family: 'Outfit', sans-serif; font-weight: 700; font-style: italic; font-size: 22px; text-align: center;">
                    ${escapeHtml(label)}
                </span>
            </div>`;
    }).join('');

    return `<div style="${containerStyle}">${blokHtml}</div>`;
}

export function renderIntroSlide(slide: Slide, _slideIndex: number): { html: string; templateClass: string } {

    const headerContent = buildHeaderHtml(slide);

    const titleHtml = slide.content.title
        ? `<h1>${escapeHtml(slide.content.title)}</h1>`
        : '';

    const mainContent = titleHtml;

    // Use blokken grid if available, otherwise fallback to star icon
    const hasBlokken = slide.content.blokken && slide.content.blokken.length > 0;
    const visualHtml = hasBlokken
        ? buildBlokkenHtml(slide.content.blokken!)
        : `<div class="visual-container" style="display: flex; align-items: center; justify-content: center; height: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 150px; height: 150px; color: #0081C6;">
                <path fill-rule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clip-rule="evenodd" />
            </svg>
        </div>`;

    const footerLeft = '';
    const ctaHtml = `
        <div class="cta-badge">
            <svg class="cta-badge-arrow" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg" style="width:50px;height:28px;transform:rotate(-5deg);">
                <path d="M 10 25 L 90 25 M 70 10 L 90 25 L 70 40" />
            </svg>
            <div class="cta-badge-text">Swipe</div>
        </div>`;

    const html = buildZonesHtml({ headerContent, mainContent, visualHtml, footerLeft, ctaHtml });
    return { html, templateClass: 'template-a' };
}
