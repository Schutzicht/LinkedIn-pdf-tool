import { CONFIG } from '../src/config.js';

console.log("Config loaded:", !!CONFIG);
console.log("API Key present:", !!CONFIG.ai.apiKey);
