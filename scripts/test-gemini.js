const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGemini() {
    const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.replace(/["']/g, '').trim() : null;

    if (!apiKey) {
        console.error("❌ NO API KEY FOUND in .env");
        process.exit(1);
    }

    console.log(`🔑 Testing Key: ${apiKey.substring(0, 4)}...${apiKey.slice(-4)}`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    try {
        console.log("📡 Sending test prompt...");
        const result = await model.generateContent("Say 'Hello from Gemini!' if you can hear me.");
        const response = await result.response;
        console.log("✅ SUCCESS! Response:");
        console.log(response.text());
    } catch (error) {
        console.error("❌ ERROR FAILED:");
        console.error(error.message);

        if (error.message.includes("404")) {
            console.log("\n💡 DIAGNOSIS: 404 usually means the Model Name is wrong OR the API Key doesn't have access to this model (Free tier limitation?).");
            console.log("Attempting to list models...");
            try {
                // Manual fetch to list models
                const models = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                const data = await models.json();
                console.log("AVAILABLE MODELS:", JSON.stringify(data, null, 2));
            } catch (e) {
                console.log("Could not list models manually.");
            }
        }
    }
}

testGemini();
