import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

/**
 * Widea huisstijl blokken — organische vormen als achtergrond achter tekst.
 * Elke blok werkt als een abstracte "button": de tekst staat er bovenop.
 *
 * 5 kleuren × 3 variaties = 15 PNGs, ingeladen als base64 data URI.
 */

export type BlokKleur = 'blauw' | 'grijs' | 'oranje' | 'witte' | 'zwarte';

interface Blok {
    dataUri: string;
    kleur: BlokKleur;
}

const BLOKKEN_DIR = path.resolve(__dirname, '../../public/assets/blokken');

const BLOK_DEFS: { filename: string; kleur: BlokKleur }[] = [
    { filename: 'blokken blauw 1.png',  kleur: 'blauw' },
    { filename: 'blokken blauw 2.png',  kleur: 'blauw' },
    { filename: 'blokken blauw 3.png',  kleur: 'blauw' },
    { filename: 'blokken grijs 1.png',  kleur: 'grijs' },
    { filename: 'blokken grijs 2.png',  kleur: 'grijs' },
    { filename: 'blokken grijs 3.png',  kleur: 'grijs' },
    { filename: 'blokken oranje 1.png', kleur: 'oranje' },
    { filename: 'blokken oranje 2.png', kleur: 'oranje' },
    { filename: 'blokken oranje 3.png', kleur: 'oranje' },
    { filename: 'blokken witte 1.png',  kleur: 'witte' },
    { filename: 'blokken witte 2.png',  kleur: 'witte' },
    { filename: 'blokken witte 3.png',  kleur: 'witte' },
    { filename: 'blokken zwarte 1.png', kleur: 'zwarte' },
    { filename: 'blokken zwarte 2.png', kleur: 'zwarte' },
    { filename: 'blokken zwarte 3.png', kleur: 'zwarte' },
];

const ALLE_BLOKKEN: Blok[] = BLOK_DEFS.map(def => {
    const filePath = path.join(BLOKKEN_DIR, def.filename);
    let dataUri = '';
    try {
        const buffer = fs.readFileSync(filePath);
        dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
    } catch {
        logger.warn({ file: def.filename }, 'Blok PNG niet gevonden');
    }
    return { dataUri, kleur: def.kleur };
}).filter(b => b.dataUri !== '');

const SLIDE_TYPE_KLEUR: Record<string, BlokKleur> = {
    intro:      'blauw',
    content:    'grijs',
    engagement: 'oranje',
    outro:      'blauw',
};

/**
 * Geeft een blok terug voor een bepaald slide-type en slide-index.
 */
export function getBlokForSlide(slideType: string, slideIndex: number): Blok {
    const kleur = SLIDE_TYPE_KLEUR[slideType] ?? 'grijs';
    const blokkenVanKleur = ALLE_BLOKKEN.filter(b => b.kleur === kleur);
    if (blokkenVanKleur.length === 0) {
        return { dataUri: '', kleur };
    }
    return blokkenVanKleur[slideIndex % blokkenVanKleur.length]!;
}

/**
 * Wikkelt HTML content in een container met de blok als achtergrondvorm.
 * De blok schaalt mee met de content en zit erachter als een abstracte "button".
 *
 * @param blok      Het blok-object (van getBlokForSlide)
 * @param innerHtml De HTML content die OP de blok komt te staan (bijv. titel)
 * @param options   Optionele styling overrides
 */
export function wrapWithBlok(blok: Blok, innerHtml: string, options: {
    opacity?: number;
    /** Extra padding rondom de tekst (px) */
    padding?: number;
} = {}): string {
    if (!blok.dataUri) return innerHtml;

    const { opacity = 0.20, padding = 40 } = options;

    return `
        <div style="
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: ${padding}px ${padding * 1.5}px;
        ">
            <img
                src="${blok.dataUri}"
                alt=""
                aria-hidden="true"
                style="
                    position: absolute;
                    top: -40%;
                    left: -25%;
                    width: 150%;
                    height: 180%;
                    object-fit: fill;
                    opacity: ${opacity};
                    pointer-events: none;
                    user-select: none;
                    z-index: 0;
                "
            />
            <div style="position: relative; z-index: 1;">
                ${innerHtml}
            </div>
        </div>
    `;
}
