import express from 'express';
import * as path from 'path';
import { ContentProcessor } from './content-engine/processor';
import { VisualRenderer } from './visual-engine/renderer';
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

        // 1. Generate Content (Mocked currently)
        const carouselData = await contentProcessor.generateCarousel(topic);

        // 2. Generate Visuals
        const outputDir = path.join(__dirname, '../output', `session-${Date.now()}`);
        await renderer.renderCarousel(carouselData, outputDir);

        // 3. Return paths
        // We need to return URLs relative to the public server
        // Path relative from 'output' folder which is mounted at /output
        const relativePath = path.relative(path.join(__dirname, '../output'), outputDir);
        const imageUrls = carouselData.slides.map((_, i) => `/output/${relativePath}/slide-${i + 1}.png`);

        res.json({
            success: true,
            data: carouselData,
            images: imageUrls
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Generation failed' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
