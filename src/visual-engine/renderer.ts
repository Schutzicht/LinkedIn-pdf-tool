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
        const launchOptions: any = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        this.browser = await puppeteer.launch(launchOptions);
    }

    async close() {
        if (this.browser) await this.browser.close();
    }

    async renderCarousel(data: CarouselData, outputDir: string) {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const page = await this.browser.newPage();
        // Set viewport to 1638x2048 (High Res 4:5)
        await page.setViewport({ width: 1638, height: 2048, deviceScaleFactor: 1 });

        for (let i = 0; i < data.slides.length; i++) {
            const slide = data.slides[i];
            if (!slide) continue;

            const { html, templateClass } = this.generateSlideHtml(slide);

            // Set content
            await page.setContent(this.templateHtml, { waitUntil: 'domcontentloaded' });

            // Inject Content & Classes
            await page.evaluate((html: string, templateClass: string) => {
                const container = document.getElementById('slide-container');
                if (container) {
                    container.innerHTML = html; // Inject the ZONES content
                    container.className = `slide-container ${templateClass}`;
                }
            }, html, templateClass);

            // Wait for images
            await page.evaluate(async () => {
                const selectors = Array.from(document.querySelectorAll("img"));
                await Promise.all(selectors.map(img => {
                    if (img.complete) return;
                    return new Promise((resolve) => {
                        img.addEventListener('load', resolve);
                        img.addEventListener('error', resolve);
                    });
                }));
            });

            const filename = `slide-${i + 1}.png`;
            await page.screenshot({
                path: path.join(outputDir, filename),
                omitBackground: false
            });
            console.log(`Rendered ${filename} (${templateClass})`);
        }

        await page.close();
    }

    private generateSlideHtml(slide: Slide): { html: string, templateClass: string } {
        let templateClass = 'template-b'; // Default: Content slide
        let visualHtml = '';
        let ctaHtml = '';

        // --- 1. Rule-Based Template Selection ---
        if (slide.type === 'intro') {
            templateClass = 'template-a'; // Cover + Visual
            // Add a visual placeholder for Intro
            visualHtml = `<div class="visual-placeholder">VISUAL<br>ZONE</div>`;
        } else if (slide.type === 'outro' || slide.type === 'engagement') {
            templateClass = 'template-c'; // Engagement / Data
        } else {
            // Content slides
            templateClass = 'template-b';
        }

        // --- 2. Zone Content Generation ---

        // Header Zone
        const headerContent = slide.content.subtitle
            ? `<div class="header-text">${slide.content.subtitle}</div>`
            : '';

        // Main Text Zone
        let mainContent = '';
        if (slide.content.title) {
            mainContent += `<h1>${slide.content.title}</h1>`;
        }
        if (slide.content.body) {
            let formattedBody = slide.content.body.replace(/\n/g, '<br>');
            // Simple bolding: *text* -> <strong>text</strong>
            formattedBody = formattedBody.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
            mainContent += `<div class="body-text">${formattedBody}</div>`;
        }

        // Footer Zone (Left side optional text)
        const footerLeft = slide.content.footer
            ? slide.content.footer
            : (slide.type === 'intro' ? 'Swipe voor meer 👉' : '');

        // CTA Zone (Strict Rules: "Klik hier" or "Swipe")
        if (slide.type === 'intro' || (slide.content.cta && slide.content.cta.includes('Swipe'))) {
            ctaHtml = `
                <div class="cta-badge">
                   Swipe 👉
                </div>
            `;
        } else if (slide.type === 'outro') {
            ctaHtml = `
                <div class="cta-badge" style="background: var(--primary-color);">
                   Link in de post!
                </div>
            `;
        }

        // Combine into the HTML structure expected by the grid layout
        const zonesHtml = `
            <div class="header-zone">${headerContent}</div>
            <div class="main-text-zone">${mainContent}</div>
            <div class="visual-zone">${visualHtml}</div>
            <div class="cta-zone">${ctaHtml}</div>
            <div class="footer-zone">
                <div class="footer-left">${footerLeft}</div>
                <div class="footer-right">
                    <div class="footer-text" style="display:inline-block; text-align:right; margin-right: 20px;">
                        BUSINESS<br><span>VERBETERAARS</span>
                    </div>
                    <div class="footer-logo" style="display:inline-block;">
                         <img src="https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg" alt="Logo">
                    </div>
                </div>
            </div>
        `;

        return { html: zonesHtml, templateClass };
    }
}
