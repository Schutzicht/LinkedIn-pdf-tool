import express from 'express';
import * as path from 'path';
import { ContentProcessor } from './content-engine/processor';
import { VisualRenderer } from './visual-engine/renderer';
import archiver from 'archiver';
import * as fs from 'fs';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, '../public')));
// Serve generated images from 'output' directory
app.use('/output', express.static(path.join(__dirname, '../output')));

const contentProcessor = new ContentProcessor();
const renderer = new VisualRenderer();

// Initialize renderer (launch browser)
renderer.init().then(() => console.log('Visual Renderer ready'));

// Helper to handle rendering and response
async function processAndRespond(res: express.Response, carouselData: any) {
    const outputDir = path.join(__dirname, '../output', `session-${Date.now()}`);
    await renderer.renderCarousel(carouselData, outputDir);

    // Generate ZIP
    const zipName = 'carousel.zip';
    const zipPath = path.join(outputDir, zipName);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        // Add all PNG files from the directory
        archive.glob('*.png', { cwd: outputDir });
        archive.finalize();
    });

    // Return paths
    const relativePath = path.relative(path.join(__dirname, '../output'), outputDir);
    const imageUrls = carouselData.slides.map((_: any, i: number) => `/output/${relativePath}/slide-${i + 1}.png`);
    const zipUrl = `/output/${relativePath}/${zipName}`;

    res.json({
        success: true,
        data: carouselData,
        images: imageUrls,
        zipUrl: zipUrl
    });
}

app.post('/api/generate', async (req, res) => {
    try {
        const { topic } = req.body;
        console.log(`Received request for: ${topic}`);

        // 1. Generate Content
        const carouselData = await contentProcessor.generateCarousel(topic);

        // 2. Process Visuals & ZIP
        await processAndRespond(res, carouselData);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown generation error'
        });
    }
});

app.post('/api/render', async (req, res) => {
    try {
        const { slides } = req.body;
        console.log(`Received render request for: ${slides.length} slides`);

        // Reconstruct carousel object (or just pass slides if that's what renderer expects)
        // Renderer expects { slides: Slide[] }
        const carouselData = { slides };

        await processAndRespond(res, carouselData);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown render error'
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});
