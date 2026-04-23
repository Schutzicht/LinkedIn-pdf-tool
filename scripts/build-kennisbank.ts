/**
 * Build kennisbank-tekst uit de .docx columns in aangeleverde-content/widea/columns/.
 *
 * Run: npm run build:kennisbank
 *
 * Output: src/content-engine/jeroen-kennisbank.txt
 * Format: "--- BESTANDSNAAM ZONDER EXT ---" als separator, gevolgd door de
 * platte tekst van de column. Wordt door processor.ts ingelezen als
 * referentiemateriaal voor Jeroens schrijfstijl.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import mammoth from 'mammoth';

const COLUMNS_DIR = path.resolve(__dirname, '..', 'aangeleverde-content', 'widea', 'columns');
const OUTPUT_FILE = path.resolve(__dirname, '..', 'src', 'content-engine', 'jeroen-kennisbank.txt');

function titleFromFilename(filename: string): string {
    return filename
        .replace(/\.docx$/i, '')
        .trim()
        .toUpperCase();
}

async function main() {
    const entries = await fs.readdir(COLUMNS_DIR);
    const docxFiles = entries
        .filter(f => f.toLowerCase().endsWith('.docx'))
        .sort();

    if (docxFiles.length === 0) {
        console.error(`Geen .docx bestanden gevonden in ${COLUMNS_DIR}`);
        process.exit(1);
    }

    console.log(`Verwerken: ${docxFiles.length} columns uit ${COLUMNS_DIR}`);

    const parts: string[] = [];
    for (const file of docxFiles) {
        const fullPath = path.join(COLUMNS_DIR, file);
        try {
            const { value: text, messages } = await mammoth.extractRawText({ path: fullPath });
            const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

            if (!cleaned) {
                console.warn(`  ! Lege extractie: ${file}`);
                continue;
            }

            parts.push(`--- ${titleFromFilename(file)} ---\n${cleaned}`);
            console.log(`  ✓ ${file} (${cleaned.length} chars)`);

            const warnings = messages.filter(m => m.type === 'warning');
            if (warnings.length > 0) {
                console.warn(`    ${warnings.length} waarschuwing(en) bij extractie`);
            }
        } catch (err) {
            console.error(`  ✗ Fout bij ${file}:`, err instanceof Error ? err.message : err);
        }
    }

    const output = parts.join('\n\n\n') + '\n';
    await fs.writeFile(OUTPUT_FILE, output, 'utf8');

    console.log(`\nKennisbank geschreven naar ${OUTPUT_FILE}`);
    console.log(`Totaal: ${parts.length} columns, ${output.length} chars`);
}

main().catch(err => {
    console.error('Kennisbank build mislukt:', err);
    process.exit(1);
});
