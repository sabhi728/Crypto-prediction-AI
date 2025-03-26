const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

// Ensure directory exists
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
    }
}

// Save data to file
async function saveData(data, filename) {
    await ensureDir(config.DATA_DIR);
    const filePath = path.join(config.DATA_DIR, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to: ${filePath}`);
}

// Format timestamp
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().split('T')[0];
}

module.exports = {
    ensureDir,
    saveData,
    formatTimestamp
}; 