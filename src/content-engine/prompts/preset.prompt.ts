import { BRAND } from '../../config';

interface PresetSummary {
    id: string;
    name: string;
    useWhen: string;
    dontUseWhen: string;
    examples: string[];
}

/**
 * STAP 1: Laat AI het juiste preset kiezen + bepaal of lamp icoon past.
 */
export function buildPresetSelectionPrompt(topic: string, presets: PresetSummary[]): string {
    const presetList = presets.map((p, i) => `
${i + 1}. ID: "${p.id}" — ${p.name}
   GEBRUIK ALS: ${p.useWhen}
   GEBRUIK NIET ALS: ${p.dontUseWhen}
   Voorbeelden: ${p.examples.join(' | ')}`).join('\n');

    return `
Je bent een redacteur die LinkedIn carousels samenstelt voor business coach Jeroen.
Op basis van het ONDERWERP kies je het BESTE preset uit de lijst hieronder.

ONDERWERP: "${topic}"

BESCHIKBARE PRESETS:
${presetList}

REGELS:
- Lees de "GEBRUIK ALS" en "GEBRUIK NIET ALS" zorgvuldig.
- Kies het preset dat het BESTE past bij het onderwerp.
- Als geen enkel preset perfect past, kies degene die het meest verwant is.
- SWOT mag worden gekozen als het onderwerp gaat over:
  * de woorden "SWOT", "sterktes", "zwaktes", "kansen", "bedreigingen"
  * "vier kanten/dimensies/aspecten" van een bedrijf
  * strategische evaluatie of analyse van een bedrijf vanuit meerdere hoeken
  * "bedrijf doorlichten", "scan", "audit"
- "X stappen" presets alleen als het onderwerp expliciet om een proces of stappenplan vraagt.
- Vermijd het vrijwel altijd kiezen van hetzelfde preset — varieer per onderwerp.

Bepaal ook of een lamp-icoon (💡 ideeën symbool) past. Antwoord ja als het onderwerp gaat over:
- Ideeën, brainstormen, inspiratie
- Innovatie, creativiteit, vernieuwing
- Aha-momenten, nieuwe inzichten, doorbraken
Anders: nee.

Geef ALLEEN dit JSON formaat terug:
{
  "presetId": "id-van-gekozen-preset",
  "reden": "korte uitleg waarom",
  "lampIcoon": true | false
}
`.trim();
}

/**
 * STAP 2: Vul de tekst-velden in voor het gekozen preset.
 * Kennisbank wordt meegegeven voor stijl-referentie.
 */
export function buildPresetFillPrompt(
    topic: string,
    preset: any,
    kennisbank: string
): string {
    // Build a list of fields the AI needs to fill
    const fieldsToFill: string[] = [];
    const slideDescriptions: string[] = [];

    preset.slides.forEach((slide: any, i: number) => {
        const slideNum = i + 1;
        const fields: string[] = [];

        if (slide.content) {
            for (const [key, value] of Object.entries(slide.content)) {
                if (typeof value === 'string' && value.startsWith('ai')) {
                    const fieldKey = `slide${slideNum}_${key}`;
                    fields.push(`${key} (${describeFieldType(value)})`);
                    fieldsToFill.push(fieldKey);
                } else if (typeof value === 'string' && value.startsWith('fixed-')) {
                    fields.push(`${key} (vast - ${value.replace('fixed-', '')})`);
                }
            }
        }

        slideDescriptions.push(`Slide ${slideNum} (${slide.type})${slide.layout ? ' - layout: ' + slide.layout : ''}: ${fields.join(', ') || '(automatisch)'}`);
    });

    return `
Je bent Jeroen van Business Verbeteraars. Je schrijft LinkedIn carousels.

**REFERENTIEMATERIAAL — KOPIEER DEZE STIJL EXACT:**
${kennisbank}

**SCHRIJFSTIJL (STRIKT):**
- Wie: Ervaren business coach. Geen guru. Nuchter, direct, reflectief.
- Toon: Confronterend maar respectvol. Legt problemen bloot vanuit ervaring.
- Taalgebruik: Professioneel, toegankelijk Nederlands. NOOIT grof, plat of informeel.
- Retorische middelen: Gebruik "Nee: ..." om aannames te corrigeren. Stel retorische vragen.
- Zinslengte: Mix van kort en lang. Korte zinnen voor impact.
- VERMIJD: Clickbait, superlatieven, generieke business jargon, grof taalgebruik.

**ONDERWERP:** "${topic}"

**PRESET STRUCTUUR:** ${preset.name}
${slideDescriptions.join('\n')}

**TAAK:**
Vul de teksten in volgens onderstaand JSON schema. Lees de veld-types goed:

VELD TYPES & LIMIETEN:
- "subtitle": korte ondertitel met tildes, bijv. "~~~ DE VRAAG VAN VANDAAG ~~~" (max 40 tekens, ALL CAPS)
- "title" (intro): prikkelende vraag of stelling, max 10 woorden
- "title" (content): korte krachtige conclusie, max 8 woorden
- "title" (engagement): reflectieve vraag, max 6 woorden
- "body" (ai-long): 80-130 woorden, 5-8 zinnen, ga de diepte in met voorbeelden en reflectie
- "body" (ai-medium): 40-70 woorden, 3-5 zinnen
- "blokken" (ai-3): 3 woorden van max 10 letters elk, passend bij onderwerp
- "blokken" (ai-4): 4 woorden van max 10 letters elk
- "blokken" (ai-5): 5 woorden van max 10 letters elk
- "blokken" (ai-3-lessons): 3 korte woorden die de 3 lessen samenvatten
- "blokken" (ai-5-lessons): 5 korte woorden die de 5 lessen samenvatten
- "blokken" (ai-3-myths): 3 korte woorden voor de 3 mythes
- "blokken" (ai-3-steps): ["Stap 1", "Stap 2", "Stap 3"] of soortgelijk
- "blokken" (ai-4-steps): 4 fase-namen
- "blokken" (ai-5-steps): 5 stap-namen
- "blokken" (ai-2-contrast): 2 woorden die de tegenstelling vangen, met "?" bij elk

BLOKKEN REGELS:
- Elk blok-woord MAXIMAAL 10 letters
- Geen herhalingen of synoniemen
- Visueel onderscheidend (verschillende lengtes ok)
- Past bij het onderwerp

POSTBODY REGELS (BELANGRIJK!):
- Schrijf 300-400 woorden — diepgaand verhaal, geen samenvatting
- Begin met herkenbare observatie
- Bouw op met voorbeelden, zinnen die ademen
- Korte alinea's, witregels tussen gedachten
- Eindig met reflectieve vraag
- 3-5 hashtags onderaan: #businessverbeteraars #ondernemen ...

GEEF ALLEEN DIT JSON FORMAAT TERUG (geen markdown, geen uitleg):
{
  "title": "korte interne titel",
  "postBody": "lange LinkedIn post tekst (300-400 woorden) met hashtags",
  "slides": [
${preset.slides.map((s: any, i: number) => generateSlideTemplate(s, i + 1)).join(',\n')}
  ]
}
`.trim();
}

function describeFieldType(value: string): string {
    const map: Record<string, string> = {
        'ai': 'AI te genereren tekst',
        'ai-long': 'lange tekst 80-130 woorden',
        'ai-medium': 'medium tekst 40-70 woorden',
        'ai-3': '3 korte blok-woorden',
        'ai-4': '4 korte blok-woorden',
        'ai-5': '5 korte blok-woorden',
        'ai-3-lessons': '3 les-trefwoorden',
        'ai-5-lessons': '5 les-trefwoorden',
        'ai-3-myths': '3 mythe-trefwoorden',
        'ai-3-steps': '3 stap-namen',
        'ai-4-steps': '4 stap/fase-namen',
        'ai-5-steps': '5 stap-namen',
        'ai-2-contrast': '2 contrast-woorden met ?',
    };
    return map[value] || 'AI veld';
}

function generateSlideTemplate(slide: any, slideNum: number): string {
    const lines: string[] = [];
    lines.push(`    {`);
    lines.push(`      "type": "${slide.type}",`);
    lines.push(`      "id": "slide-${slideNum}"`);

    if (slide.type === 'outro') {
        lines.push(`      ,"content": {
        "title": "DANKJEWEL!",
        "subtitle": "MEER VRAGEN?",
        "body": "${BRAND.text.website}",
        "cta": "Connect"
      }`);
    } else if (slide.content) {
        const contentParts: string[] = [];
        for (const [key, value] of Object.entries(slide.content)) {
            if (typeof value === 'string') {
                if (value === 'fixed-swot') {
                    contentParts.push(`        "blokken": ["Sterktes", "Zwaktes", "Kansen", "Bedreigingen"]`);
                } else if (value === 'fixed-voor-na') {
                    contentParts.push(`        "blokken": ["Voor", "Na"]`);
                } else if (value.startsWith('ai')) {
                    if (key === 'blokken') {
                        contentParts.push(`        "blokken": ["...", "..."]`);
                    } else {
                        contentParts.push(`        "${key}": "..."`);
                    }
                } else {
                    contentParts.push(`        "${key}": "${value}"`);
                }
            }
        }
        lines.push(`      ,"content": {
${contentParts.join(',\n')}
      }`);
    }

    if (slide.layout) {
        lines.push(`      ,"visuals": { "layout": "${slide.layout}" }`);
    }

    lines.push(`    }`);
    return lines.join('\n');
}
