import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // High Res 4:5
    await page.setViewport({ width: 1638, height: 2048, deviceScaleFactor: 1 });
    
    const templateHtml = fs.readFileSync(path.join(__dirname, 'src/visual-engine/templates/template.html'), 'utf8');
    
    let combinedHtml = '';
    for (let i=0; i<3; i++) {
        combinedHtml += `
            <div class="slide-wrapper" id="slide-wrapper-${i}" style="background-color: ${i%2===0?'red':'blue'}; width: 1638px; height: 2048px;">
                <h1 style="font-size: 100px;">Slide ${i}</h1>
            </div>
        `;
    }
    
    await page.setContent(templateHtml);
    await page.evaluate((html) => {
        document.getElementById('carousel-root')!.innerHTML = html;
    }, combinedHtml);
    
    await page.pdf({
        path: 'debug.pdf',
        width: '1638px',
        height: '2048px',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    
    await browser.close();
}

run().catch(console.error);
