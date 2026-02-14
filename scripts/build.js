const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("🚀 Starting Robust Build Process...");

// 1. Clean Dist
console.log("🧹 Cleaning dist folder...");
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    fs.rmSync(distPath, { recursive: true, force: true });
}

// 2. Run TypeScript Compiler
console.log("🔨 Compiling TypeScript...");
try {
    const tscPath = path.join(__dirname, '../node_modules/.bin/tsc');
    console.log(`Using TSC at: ${tscPath}`);

    if (fs.existsSync(tscPath)) {
        execSync(`"${tscPath}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    } else {
        console.log("⚠️ Local TSC not found, falling back to npx tsc...");
        execSync('npx tsc', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    }
    console.log("✅ TypeScript compilation successful.");
} catch (error) {
    console.error("❌ TypeScript compilation FAILED.");
    console.error("This is likely a type error in the code.");
    process.exit(1);
}

// 3. Copy Templates (Visual Engine)
console.log("📂 Copying Templates...");
const srcTemplates = path.join(__dirname, '../src/visual-engine/templates');
const destTemplates = path.join(__dirname, '../dist/visual-engine/templates');

try {
    // Ensure destination directory exists
    fs.mkdirSync(path.join(__dirname, '../dist/visual-engine'), { recursive: true });

    // Recursive copy function
    function copyDir(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        let entries = fs.readdirSync(src, { withFileTypes: true });

        for (let entry of entries) {
            let srcPath = path.join(src, entry.name);
            let destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    if (fs.existsSync(srcTemplates)) {
        copyDir(srcTemplates, destTemplates);
        console.log("✅ Templates copied successfully.");
    } else {
        console.warn("⚠️ Warning: Template directory not found at " + srcTemplates);
    }

} catch (error) {
    console.error("❌ Failed to copy templates:", error);
    process.exit(1);
}

console.log("🎉 Build Complete!");
