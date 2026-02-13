import { ContentProcessor } from '../src/content-engine/processor.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing Content Generation...");
    const processor = new ContentProcessor();
    try {
        const data = await processor.generateCarousel("Why innovation fails in big companies");
        console.log("Success! Generated Data:");
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Test failed:", error);
    }
}

test();
