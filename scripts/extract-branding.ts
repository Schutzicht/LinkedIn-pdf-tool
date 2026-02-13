import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
const pdf = pdfModule.default || pdfModule;

console.log('PDF Module type:', typeof pdf);
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfPath = path.join(__dirname, '../businessverbeteraars-groeiweigeraars.pdf');

async function extractBranding() {
    try {
        if (!fs.existsSync(pdfPath)) {
            console.error(`PDF not found at ${pdfPath}`);
            return;
        }

        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdf(dataBuffer);

        console.log("PDF Info:", data.info);
        console.log("PDF Text Preview (first 1000 chars):");
        console.log(data.text.substring(0, 1000));

        // In a real scenario, we'd use a more advanced PDF parser (like pdfjs-dist) to get vector graphics/colors.
        // pdf-parse gives mostly text.
        // However, we can look for specific keywords or just ask the user.
        // For now, this script confirms we can read the file.

    } catch (error) {
        console.error("Error reading PDF:", error);
    }
}

extractBranding();
