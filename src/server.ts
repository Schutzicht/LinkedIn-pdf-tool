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


app.post('/api/generate', async (req, res) => {
    try {
        const { topic } = req.body;
        console.log(`Received request for: ${topic}`);

        // 1. Generate Content
        const carouselData = await contentProcessor.generateCarousel(topic);

        // 2. Generate Visuals
        const outputDir = path.join(__dirname, '../output', `session-${Date.now()}`);
        await renderer.renderCarousel(carouselData, outputDir);

        // 3. Generate ZIP
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

        // 4. Return paths
        const relativePath = path.relative(path.join(__dirname, '../output'), outputDir);
        const imageUrls = carouselData.slides.map((_, i) => `/output/${relativePath}/slide-${i + 1}.png`);
        const zipUrl = `/output/${relativePath}/${zipName}`;

        res.json({
            success: true,
            data: carouselData,
            images: imageUrls,
            zipUrl: zipUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown generation error'
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});
