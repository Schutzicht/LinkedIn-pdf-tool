import { ContentProcessor } from './content-engine/processor';
import { VisualRenderer } from './visual-engine/renderer';
import * as path from 'path';

async function main() {
    console.log("Starting Jeroen LinkedIn Tool Test...");

    // 1. Get Content (Mock for now)
    const contentProcessor = new ContentProcessor();
    const carouselData = await contentProcessor.generateCarousel("Test input");
    console.log(`Generated content for: ${carouselData.title}`);

    // 2. Render Visuals
    const renderer = new VisualRenderer();
    await renderer.init();

    const outputDir = path.join(__dirname, '..', 'output');
    console.log(`Rendering slides to: ${outputDir}`);

    await renderer.renderCarousel(carouselData, outputDir);

    await renderer.close();
    console.log("Done! Check the output folder.");
}

main().catch(console.error);
