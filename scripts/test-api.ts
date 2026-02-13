import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const modelsToTry = [
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-1.5-flash'
];

async function testKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("No API Key found in .env");
        return;
    }
    console.log("Testing with key:", key.substring(0, 10) + "...");

    const genAI = new GoogleGenerativeAI(key);

    for (const modelName of modelsToTry) {
        console.log(`\nTesting model: ${modelName}...`);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello, are you there?");
            console.log(`✅ SUCCESS with ${modelName}!`);
            console.log("Response:", result.response.text());
            return; // Exit on first success
        } catch (e: any) {
            console.log(`❌ Failed with ${modelName}: ${e.message.split('[404 Not Found]')[1] || e.message}`);
        }
    }

    console.log("\nAll models failed.");
}

testKey();
