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
            if (slide.content.imageUrl) {
                // User provided an image URL
                visualHtml = `
                    <div class="visual-container" style="width: 100%; height: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; background-color: #f0f0f0;">
                         <img src="${slide.content.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Visual">
                    </div>
                `;
            } else {
                // Placeholder
                visualHtml = `
                    <div class="visual-placeholder">
                        <div class="visual-placeholder-text">
                            <span>🖼️</span><br>
                            (Plak een URL in de editor)
                        </div>
                    </div>`;
            }

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
