import puppeteer, { Browser, Page } from 'puppeteer';
import type { LaunchOptions } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import type { Slide } from '../types';
import { renderSlide } from './slide-templates';
import { logger } from '../utils/logger';

/** Minimaal type voor de renderer — de volledige CarouselData is ook compatibel */
export interface RenderInput {
    slides: Slide[];
}

export class VisualRenderer {
    private browser: Browser | null = null;
    private templateHtml: string;

    constructor() {
        const templatePath = path.join(__dirname, 'templates', 'template.html');
        this.templateHtml = fs.readFileSync(templatePath, 'utf8');
    }

    async init(): Promise<void> {
        const launchOptions: LaunchOptions = {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }

        this.browser = await puppeteer.launch(launchOptions);
    }

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info('Puppeteer browser gesloten.');
        }
    }

    async renderCarousel(data: RenderInput, outputDir: string): Promise<void> {
        if (!this.browser) {
            throw new Error('Browser is niet geïnitialiseerd. Roep init() aan.');
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const page: Page = await this.browser.newPage();
        await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
        page.on('console', (msg) => logger.debug({ pageLog: msg.text() }, 'PAGE LOG'));

        // Bouw alle slide-HTML via de template-modules
        let combinedHtml = '';
        for (let i = 0; i < data.slides.length; i++) {
            const slide = data.slides[i];
            if (!slide) continue;

            const { html, templateClass } = renderSlide(slide, i);
            combinedHtml += `
                <div class="slide-wrapper" id="slide-wrapper-${i}">
                    <div class="slide-container ${templateClass}">
                        ${html}
                    </div>
                </div>
            `;
        }

        // Laad template en injecteer slides
        await page.setContent(this.templateHtml, { waitUntil: 'domcontentloaded' });
        await page.evaluate((html: string) => {
            const container = document.getElementById('carousel-root');
            if (container) container.innerHTML = html;
        }, combinedHtml);

        // Wacht op afbeeldingen
        await page.evaluate(async () => {
            const imgs = Array.from(document.querySelectorAll('img'));
            await Promise.all(imgs.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise<void>(resolve => {
                    img.addEventListener('load', () => resolve());
                    img.addEventListener('error', () => resolve());
                });
            }));
        });

        // 1. PNG screenshots per slide
        for (let i = 0; i < data.slides.length; i++) {
            const filename = `slide-${i + 1}.png`;
            const element = await page.$(`#slide-wrapper-${i}`);
            if (element) {
                await element.screenshot({ path: path.join(outputDir, filename), omitBackground: false });
                logger.info(`Rendered PNG: ${filename}`);
            }
        }

        // 2. Multi-page PDF
        await page.pdf({
            path: path.join(outputDir, 'carousel.pdf'),
            width: '1080px',
            height: '1080px',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        logger.info('Rendered PDF: carousel.pdf');

        await page.close();
    }
}
