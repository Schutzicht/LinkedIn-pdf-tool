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
        // Set viewport to 1080x1350 (4:5 Ratio)
        await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 2 });

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

        // Header / Subtitle (The "Eyebrow")
        if (slide.content.subtitle) {
            html += `<div class="header">${slide.content.subtitle}</div>`;
        }

        // Main Content Container
        html += `<div class="content">`;

        // Title (Intro/Outro usually)
        if (slide.content.title) {
            html += `<h1>${slide.content.title}</h1>`;
        }

        // Body Text (Content slides)
        // Auto-bold logic: bold words between asterisks *word* -> <strong>word</strong>
        if (slide.content.body) {
            let formattedBody = slide.content.body.replace(/\n/g, '<br>');
            // Simple robust regex for bolding: *text*
            formattedBody = formattedBody.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');

            html += `<p class="body-text">${formattedBody}</p>`;
        }

        html += `</div>`; // End content container

        // Source Citation (Bottom)
        if (slide.content.footer && slide.type === 'content') {
            html += `<div class="source-citation">${slide.content.footer}</div>`;
        }

        // --- DECORATIONS & INTERACTIONS ---

        // Intro Slide: "Klik hier" Arrow (Top Right usually)
        if (slide.type === 'intro' || (slide.content.cta && slide.content.cta.includes('Swipe'))) {
            html += `
                <div class="interaction-container top-right">
                    <div class="click-here-text">Klik<br>hier</div>
                    <svg class="hand-arrow" viewBox="0 0 50 80">
                        <path d="M25 75 C 25 75, 20 40, 10 10 M 10 10 L 30 25 M 10 10 L 5 30" />
                    </svg>
                </div>
            `;
        }

        // Engagement/Outro Slide: "Like & Comment" Arrow (Bottom Left)
        if (slide.type === 'engagement' || (slide.content.cta && (slide.content.cta.includes('Like') || slide.content.cta.includes('Connect')))) {
            html += `
                <div class="interaction-container bottom-left">
                    <div class="click-here-text">Like &<br>comment</div>
                     <svg class="hand-arrow" viewBox="0 0 50 80" style="transform: scaleY(-1) rotate(20deg);">
                        <path d="M25 75 C 25 75, 20 40, 10 10 M 10 10 L 30 25 M 10 10 L 5 30" />
                    </svg>
                </div>
            `;
        }

        // Footer Logo (Fixed Bottom Right)
        html += `
            <div class="footer">
                <div class="logo">
                     <img src="https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg" alt="Business Verbeteraars">
                </div>
                <div class="footer-text">
                    BUSINESS
                    <span>VERBETERAARS</span>
                </div>
            </div>
        `;

        return html;
    }
}
