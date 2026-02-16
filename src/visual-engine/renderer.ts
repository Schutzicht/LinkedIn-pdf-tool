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

        // Add console log forwarding for debug
        page.on('console', (msg: any) => console.log('PAGE LOG:', msg.text()));

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
        let templateClass = 'template-b'; // Default
        let visualHtml = '';
        let ctaHtml = '';
        let headerContent = '';
        let mainContent = '';
        let footerLeft = '';

        // --- 1. SLIDE TYPE LOGIC ---

        if (slide.type === 'intro') {
            templateClass = 'template-a';

            // Intro Visual
            // Replaced photo with a brand-aligned SVG Icon (Magic/Content)
            visualHtml = `
                <div class="visual-container" style="display: flex; align-items: center; justify-content: center; height: 100%;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 150px; height: 150px; color: #00aec7;">
                        <path fill-rule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clip-rule="evenodd" />
                    </svg>
                </div>`;

            // Intro Content
            if (slide.content.subtitle) headerContent = `<div class="header-text">${slide.content.subtitle}</div>`;
            if (slide.content.title) mainContent = `<h1>${slide.content.title}</h1>`;

            // Intro Footer/CTA
            footerLeft = `<div class="citation-text">Swipe voor meer 👉</div>`;
            ctaHtml = `<div class="cta-badge">Swipe 👉</div>`;

        } else if (slide.type === 'outro' || slide.type === 'engagement') {
            templateClass = 'template-c';

            // OUTRO CONTENT (Strictly Hardcoded as requested)
            // titles same size, spacer, smaller url
            mainContent = `
                <div class="outro-title">DANKJEWEL!</div>
                <div class="outro-spacer"></div>
                <div class="outro-title">MEER VRAGEN?</div>
                <a href="https://www.businessverbeteraars.nl" class="outro-url">www.businessverbeteraars.nl</a>
            `;

            // LIKE & COMMENT visual (Bottom Left)
            visualHtml = `
                <div class="like-comment-container">
                    <div class="like-comment-text">
                        Like &<br>comment
                    </div>
                    <svg class="like-comment-arrow" viewBox="0 0 50 100" xmlns="http://www.w3.org/2000/svg">
                         <path d="M 25 10 L 25 90 M 10 70 L 25 90 L 40 70" />
                    </svg>
                </div>
            `;

            // Clean Footer (Only Logo on right, which is in template struct)
            footerLeft = '';
            ctaHtml = '';

        } else {
            // STANDARD CONTENT SLIDE
            templateClass = 'template-b';

            if (slide.content.subtitle) headerContent = `<div class="header-text">${slide.content.subtitle}</div>`;

            if (slide.content.title) mainContent += `<h1>${slide.content.title}</h1>`;

            if (slide.content.body) {
                let formattedBody = slide.content.body.replace(/\n/g, '<br>');
                formattedBody = formattedBody.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
                mainContent += `<div class="body-text">${formattedBody}</div>`;
            }

            if (slide.content.footer) footerLeft = `<div class="citation-text">${slide.content.footer}</div>`;
        }

        // --- 2. HTML ASSEMBLY ---
        // Combine into the HTML structure expected by the grid layout
        const zonesHtml = `
            <div class="header-zone">${headerContent}</div>
            <div class="main-text-zone">${mainContent}</div>
            <div class="visual-zone">${visualHtml}</div>
            <div class="cta-zone">${ctaHtml}</div>
            <div class="footer-zone">
                <div class="footer-left-content">${footerLeft}</div>
                <div class="footer-right-content">
                    <div class="footer-branding">
                        <img src="https://widea.nl/wp-content/themes/widea-theme/assets/img/new-logo.svg" alt="Logo" class="footer-logo-img">
                    </div>
                </div>
            </div>
        `;

        return { html: zonesHtml, templateClass };
    }
}
