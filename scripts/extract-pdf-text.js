const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

async function extractText() {
    const pdfPath = path.join(__dirname, '../businessverbeteraars-groeiweigeraars.pdf');
    const dataBuffer = fs.readFileSync(pdfPath); // Read sync is fine for script

    try {
        const data = await pdf(dataBuffer);
        console.log("PDF Info:", data.info);
        console.log("\n--- PDF Text Content ---\n");
        console.log(data.text);
    } catch (error) {
        console.error("Error parsing PDF:", error);
    }
}

extractText();
