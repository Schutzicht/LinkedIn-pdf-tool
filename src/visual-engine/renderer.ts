import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import type { Slide, CarouselData } from '../types';



export class VisualRenderer {
    private browser: any;
    private templateHtml: string;

    constructor() {
        const templatePath = path.join(__dirname, 'templates', 'template.html');
        this.templateHtml = fs.readFileSync(templatePath, 'utf8');
    }

    async init() {
        this.browser = await puppeteer.launch();
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async renderCarousel(data: CarouselData, outputDir: string) {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const page = await this.browser.newPage();
        // 1080x1350 is the optimal LinkedIn portrait ratio (4:5), or 1080x1080 square.
        // PDF suggests square.
        await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });

        for (let i = 0; i < data.slides.length; i++) {
            const slide = data.slides[i];
            if (!slide) continue;
            const contentHtml = this.generateSlideHtml(slide);

            // Set content with proper waiting for network idle if we had external assets
            await page.setContent(this.templateHtml, { waitUntil: 'domcontentloaded' });

            await page.evaluate((html: string, slideType: string) => {
                const container = document.getElementById('slide-container');
                if (container) {
                    container.innerHTML = html;
                    container.className = 'slide-container slide-type-' + slideType; // Add type class
                }
            }, contentHtml, slide.type);

            // Wait for images to load
            await page.evaluate(async () => {
                const selectors = Array.from(document.querySelectorAll("img"));
                await Promise.all(selectors.map(img => {
                    if (img.complete) return;
                    return new Promise((resolve, reject) => {
                        img.addEventListener('load', resolve);
                        img.addEventListener('error', resolve); // Resolve on error too to avoid hang
                    });
                }));
            });

            const filename = `slide-${i + 1}.png`;
            await page.screenshot({
                path: path.join(outputDir, filename),
                omitBackground: false
            });
            console.log(`Rendered ${filename}`);
        }

        await page.close();
    }

    private generateSlideHtml(slide: Slide): string {
        let html = '';

        // Header
        if (slide.content.subtitle) {
            html += `<div class="header">${slide.content.subtitle}</div>`;
        }

        // Main Content
        html += `<div class="content">`;

        if (slide.content.title) {
            html += `<h1>${slide.content.title}</h1>`;
        }

        if (slide.visuals?.icon === 'no-growth') {
            html += `
                <div class="growth-ban-icon">
                    <span class="growth-text">GROEI</span>
                </div>
             `;
        }

        if (slide.content.body) {
            // Convert newlines to breaks
            const formattedBody = slide.content.body.replace(/\n/g, '<br>');
            html += `<p class="body-text">${formattedBody}</p>`;
        }

        if (slide.content.footer) {
            html += `<div class="source-citation">${slide.content.footer}</div>`;
        }

        html += `</div>`; // End content

        // Interaction / CTA (Right side usually)
        if (slide.content.cta && slide.content.cta.includes('Klik')) {
            html += `
                <div class="interaction-arrow">
                    Klik<br>hier
                    <!-- Simple SVG Arrow -->
                    <svg class="arrow-svg" viewBox="0 0 50 80" fill="none" stroke="currentColor" stroke-width="3">
                        <path d="M25 75 L25 5 M25 5 L5 25 M25 5 L45 25" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
             `;
        }

        if (slide.content.cta && slide.content.cta.includes('Like')) {
            html += `
                <div class="interaction-arrow" style="left: 100px; bottom: 80px; transform: rotate(10deg); right: auto;">
                    Like &<br>comment
                    <svg class="arrow-svg" viewBox="0 0 50 80" fill="none" stroke="currentColor" stroke-width="3" style="transform: rotate(180deg)">
                         <path d="M25 75 L25 5 M25 5 L5 25 M25 5 L45 25" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
             `;
        }

        // Footer Logo
        html += `
            <div class="footer">
                <div class="logo">
                     <img src="https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg" alt="Business Verbeteraars" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'logo-text-container\\'><div class=\\'logo-text\\'>BUSINESS</div><div class=\\'logo-sub\\'>VERBETERAARS</div></div>'">
                </div>
            </div>
        `;

        return html;
    }
}
