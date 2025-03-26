const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const moment = require('moment');
const yargs = require('yargs');
const logger = require('./utils/logger');

// Ensure axios is available
if (!axios) {
    throw new Error('axios not loaded');
}

// ... 其他代码

module.exports = {
    axios,  // Ensure axios is exported
    // ... 其他导出
};