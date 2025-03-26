const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./utils/logger');
const BTCPeriodClassifier = require('./ml/model');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const { translateChineseToEnglish, translateObject } = require('./utils/translator');

// Create router instance
const router = express.Router();

// Set rate limit
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    headers: true,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Request frequency exceeded'
        }
    }
});

// Apply rate limit
router.use(limiter);

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    logger.error('API error:', err);
    res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: err.message || 'Internal server error'
        }
    });
};

// Apply error handler at the end
router.use(errorHandler);

// 1. K-line data interface
router.get('/klines', async (req, res, next) => {
    try {
        const { exchange, timeframe, start, end, limit } = req.query;
        
        // Validate exchange parameter
        const normalizedExchange = exchange?.toLowerCase();
        if (!['binance', 'huobi', 'okx'].includes(normalizedExchange)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_EXCHANGE',
                    message: 'Invalid exchange name'
                }
            });
        }

        // Find the latest binance data file
        const dataDir = path.join(__dirname, '../data');
        const files = await fs.readdir(dataDir);
        
        let dataFile = null;
        
        if (normalizedExchange === 'binance') {
            const binanceFiles = files
                .filter(f => f.startsWith('btc_price_binance_') && !f.includes('20250327')); // Exclude problematic file
            
            if (binanceFiles.length > 0) {
                // Sort by file size to get the one with most data
                const fileStats = await Promise.all(
                    binanceFiles.map(async file => {
                        const filePath = path.join(dataDir, file);
                        const stats = await fs.stat(filePath);
                        return { file, size: stats.size };
                    })
                );
                
                // Sort by file size in descending order
                fileStats.sort((a, b) => b.size - a.size);
                
                // Get the file with the most data
                dataFile = path.join(dataDir, fileStats[0].file);
                logger.info(`Selected data file: ${fileStats[0].file} (${fileStats[0].size} bytes)`);
            }
        } else if (normalizedExchange === 'huobi') {
            const huobiFiles = files
                .filter(f => f.startsWith('btc_price_huobi_'));
            
            if (huobiFiles.length > 0) {
                // Sort by file size to get the one with most data
                const fileStats = await Promise.all(
                    huobiFiles.map(async file => {
                        const filePath = path.join(dataDir, file);
                        const stats = await fs.stat(filePath);
                        return { file, size: stats.size };
                    })
                );
                
                // Sort by file size in descending order
                fileStats.sort((a, b) => b.size - a.size);
                
                // Get the file with the most data
                dataFile = path.join(dataDir, fileStats[0].file);
                logger.info(`Selected data file: ${fileStats[0].file} (${fileStats[0].size} bytes)`);
            }
        }
        
        if (!dataFile) {
            // Fallback to any btc price file with actual data
            const eligibleFiles = [];
            
            // Check file sizes to find non-empty files
            for (const file of files) {
                if (file.startsWith('btc_price_') && 
                    !file.includes('validated') && 
                    !file.includes('analysis') && 
                    !file.includes('anomalies') &&
                    !file.includes('20250327')) { // Exclude the problematic file
                    
                    const filePath = path.join(dataDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        // Only include files that have meaningful content (larger than 10 bytes)
                        if (stats.size > 10) {
                            eligibleFiles.push({ file, size: stats.size });
                        }
                    } catch (err) {
                        logger.error(`Error checking file ${file}:`, err);
                    }
                }
            }
            
            if (eligibleFiles.length > 0) {
                // Sort by size descending to get the file with the most data
                eligibleFiles.sort((a, b) => b.size - a.size);
                dataFile = path.join(dataDir, eligibleFiles[0].file);
                logger.info(`Selected fallback data file: ${eligibleFiles[0].file} (${eligibleFiles[0].size} bytes)`);
            } else {
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'DATA_FILE_NOT_FOUND',
                        message: 'No suitable data file found'
                    }
                });
            }
        }
        
        // Read and parse data
        let data;
        try {
            const fileContent = await fs.readFile(dataFile, 'utf8');
            data = JSON.parse(fileContent);
            logger.info(`Successfully loaded data from ${dataFile}`);
        } catch (error) {
            logger.error(`Error reading/parsing data file ${dataFile}:`, error);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'DATA_READ_ERROR',
                    message: 'Failed to read or parse data file'
                }
            });
        }
        
        // Check if data is valid
        if (!Array.isArray(data)) {
            logger.error(`Invalid data format in ${dataFile}`);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'INVALID_DATA_FORMAT',
                    message: 'Data file has invalid format'
                }
            });
        }

        // Check if array is empty
        if (data.length === 0) {
            logger.error(`Empty data array in ${dataFile}`);
            
            // Try another file as fallback
            const eligibleFiles = [];
            
            // Find another suitable file
            for (const file of files) {
                if (file !== path.basename(dataFile) && // Skip the current file
                    file.startsWith('btc_price_') && 
                    !file.includes('validated') && 
                    !file.includes('analysis') && 
                    !file.includes('anomalies') &&
                    !file.includes('20250327')) {
                    
                    const filePath = path.join(dataDir, file);
                    try {
                        const stats = await fs.stat(filePath);
                        // Only include files that have meaningful content
                        if (stats.size > 100) { // Minimum size for meaningful data
                            const content = await fs.readFile(filePath, 'utf8');
                            const tempData = JSON.parse(content);
                            if (Array.isArray(tempData) && tempData.length > 0) {
                                eligibleFiles.push({ file, size: stats.size });
                            }
                        }
                    } catch (err) {
                        // Skip files with errors
                        logger.error(`Error checking fallback file ${file}:`, err);
                    }
                }
            }
            
            if (eligibleFiles.length > 0) {
                // Sort by size descending
                eligibleFiles.sort((a, b) => b.size - a.size);
                const fallbackFile = path.join(dataDir, eligibleFiles[0].file);
                logger.info(`Using fallback file after empty data: ${eligibleFiles[0].file}`);
                
                try {
                    // Try to load data from fallback file
                    const fallbackContent = await fs.readFile(fallbackFile, 'utf8');
                    data = JSON.parse(fallbackContent);
                    
                    if (!Array.isArray(data) || data.length === 0) {
                        throw new Error('Fallback data is also empty or invalid');
                    }
                    
                    logger.info(`Successfully loaded ${data.length} records from fallback file`);
                } catch (fallbackError) {
                    logger.error('Fallback file also failed:', fallbackError);
                    return res.status(500).json({
                        success: false,
                        error: {
                            code: 'DATA_LOAD_FAILED',
                            message: 'All data files failed to load'
                        }
                    });
                }
            } else {
                return res.status(500).json({
                    success: false,
                    error: {
                        code: 'NO_DATA_AVAILABLE',
                        message: 'No data available in any file'
                    }
                });
            }
        }
        
        // Time range filter
        let processedData = data;
        if (start) {
            processedData = processedData.filter(d => new Date(d.date) >= new Date(Number(start)));
        }
        if (end) {
            processedData = processedData.filter(d => new Date(d.date) <= new Date(Number(end)));
        }
        
        // Process time period
        if (timeframe && timeframe !== '1D') {
            try {
                processedData = processTimeframe(processedData, timeframe);
            } catch (error) {
                logger.error('Error processing timeframe:', error);
                // Just log the error but continue with original data
                logger.info('Falling back to daily timeframe');
            }
        }
        
        // Limit return quantity
        if (limit) {
            const limitNum = Number(limit);
            if (!isNaN(limitNum) && limitNum > 0) {
                processedData = processedData.slice(-limitNum);
            }
        }

        if (processedData.length === 0) {
            logger.warn(`No data found for exchange ${exchange}`);
            return res.json({
                success: true,
                data: [],
                warning: `No data found for exchange ${exchange}`
            });
        }

        res.json({
            success: true,
            data: processedData
        });
    } catch (error) {
        logger.error('Error processing K-line data:', error);
        next(error);
    }
});

// 2. Market prediction interface
router.get('/predict', async (req, res) => {
    try {
        const { exchange, days = 7 } = req.query;
        
        // Validate parameters
        if (!exchange) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: 'Missing exchange parameter'
                }
            });
        }

        try {
            // Load model
            const classifier = new BTCPeriodClassifier();
            await classifier.loadModel(path.join(__dirname, '../models/btc_period_classifier'));
            
            // Get recent data for prediction
            const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
            const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
            const recentData = data.slice(-270); // Use recent 270 days data
            
            // Perform prediction
            const prediction = await classifier.predict(recentData);
            
            res.json({
                success: true,
                data: {
                    date: new Date().toISOString().split('T')[0],
                    prediction,
                    confidence: calculateConfidence(prediction)
                }
            });
        } catch (modelError) {
            logger.error('Model loading/prediction error:', modelError);
            // Provide fallback prediction if model fails
            res.json({
                success: true,
                data: {
                    date: new Date().toISOString().split('T')[0],
                    prediction: {
                        uptrend: 0.33,
                        downtrend: 0.33,
                        sideways: 0.34
                    },
                    confidence: 0.5,
                    note: "Using fallback prediction data due to model error"
                }
            });
        }
    } catch (error) {
        next(error);
    }
});

// 3. Exchange data comparison interface
router.get('/compare', async (req, res) => {
    try {
        const { exchanges, date } = req.query;
        
        if (!exchanges) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: 'Missing exchange parameter'
                }
            });
        }

        const exchangeList = exchanges.split(',');
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // Get specified date or latest data
        const targetDate = date || data[data.length - 1].date;
        const targetData = data.find(d => d.date === targetDate);
        
        if (!targetData) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'DATA_NOT_FOUND',
                    message: 'No data found for specified date'
                }
            });
        }
        
        // Calculate comparison data
        const comparisons = {};
        let volumeTotal = 0;
        
        exchangeList.forEach(exchange => {
            const exchangeData = targetData.exchanges[exchange];
            if (exchangeData) {
                volumeTotal += exchangeData.volume;
                comparisons[exchange] = {
                    price: exchangeData.close,
                    volume: exchangeData.volume,
                    marketShare: 0 // Calculate later
                };
            }
        });
        
        // Calculate market share
        Object.keys(comparisons).forEach(exchange => {
            comparisons[exchange].marketShare = comparisons[exchange].volume / volumeTotal;
        });
        
        // Calculate price deviation
        const prices = Object.values(comparisons).map(c => c.price);
        const priceDeviation = calculatePriceDeviation(prices);
        
        res.json({
            success: true,
            data: {
                date: targetDate,
                comparisons,
                priceDeviation,
                volumeTotal
            }
        });
    } catch (error) {
        next(error);
    }
});

// 4. Historical data statistics interface
router.get('/stats', async (req, res) => {
    try {
        const { exchange, period = '1M' } = req.query;
        
        if (!exchange) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PARAMS',
                    message: 'Missing exchange parameter'
                }
            });
        }

        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // Filter data by period
        const periodData = filterDataByPeriod(data, period);
        const exchangeData = periodData.map(d => d.exchanges[exchange]).filter(Boolean);
        
        // Calculate statistics
        const stats = calculateStats(exchangeData);
        
        res.json({
            success: true,
            data: {
                period,
                stats
            }
        });
    } catch (error) {
        next(error);
    }
});

// WebSocket server setup moved to server.js

// Helper functions
function processTimeframe(data, timeframe) {
    if (!['1D', '1W', '1M'].includes(timeframe)) {
        console.warn(`Invalid timeframe: ${timeframe}, defaulting to 1D`);
        return data; // Return original data for invalid timeframes
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No data to process for timeframe conversion');
        return [];
    }

    const groupedData = {};
    
    data.forEach(item => {
        try {
            let key;
            const date = new Date(item.date);
            
            if (isNaN(date.getTime())) {
                console.warn(`Invalid date format: ${item.date}`);
                return; // Skip this item
            }
            
            switch(timeframe) {
                case '1W':
                    // Get first day of week (Sunday)
                    const firstDay = new Date(date);
                    const day = date.getDay();
                    firstDay.setDate(date.getDate() - day);
                    key = firstDay.toISOString().split('T')[0];
                    break;
                case '1M':
                    // Get first day of month
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
                    break;
                default:
                    key = item.date;
            }
            
            if (!groupedData[key]) {
                groupedData[key] = {
                    date: key,
                    open: item.open,  // First price as opening price
                    high: item.high,
                    low: item.low,
                    close: item.close,
                    volume: item.volume || 0,
                    trades: item.trades || 0
                };
            } else {
                // Update highest and lowest prices
                groupedData[key].high = Math.max(groupedData[key].high, item.high);
                groupedData[key].low = Math.min(groupedData[key].low, item.low);
                // Last price as closing price
                groupedData[key].close = item.close;
                // Accumulate volume and trades
                groupedData[key].volume += (item.volume || 0);
                groupedData[key].trades += (item.trades || 0);
            }
        } catch (err) {
            console.error('Error processing item:', err, item);
            // Continue with next item
        }
    });

    // Sort by date
    return Object.values(groupedData).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculateConfidence(prediction) {
    // Calculate prediction confidence
    // 1. Check distribution of prediction values
    // 2. Calculate strength of dominant trend
    const values = [prediction.uptrend, prediction.downtrend, prediction.sideways];
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    
    // Higher dominance of one trend, higher confidence
    const dominance = max / sum;
    
    // Other trends' dispersion also affects confidence
    const others = values.filter(v => v !== max);
    const variance = others.reduce((acc, val) => acc + Math.pow(val - (sum - max) / 2, 2), 0) / others.length;
    
    // Comprehensive calculation of confidence (0-1)
    const confidence = (dominance * 0.7 + (1 - Math.sqrt(variance)) * 0.3);
    
    return Math.min(Math.max(confidence, 0), 1);
}

function calculatePriceDeviation(prices) {
    if (prices.length < 2) return 0;
    
    // Calculate average price
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Calculate standard deviation
    const variance = prices.reduce((acc, price) => {
        return acc + Math.pow(price - avgPrice, 2);
    }, 0) / prices.length;
    
    const stdDev = Math.sqrt(variance);
    
    // Return relative standard deviation (coefficient of variation)
    return stdDev / avgPrice;
}

function filterDataByPeriod(data, period) {
    const now = new Date();
    let startDate;
    
    switch(period) {
        case '1M':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
        case '3M':
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
        case '6M':
            startDate = new Date(now.setMonth(now.getMonth() - 6));
            break;
        case '1Y':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
        default:
            throw new Error('Invalid time period');
    }
    
    return data.filter(item => new Date(item.date) >= startDate);
}

function calculateStats(data) {
    if (!data.length) {
        return {
            highest: 0,
            lowest: 0,
            average: 0,
            volatility: 0,
            volumeAvg: 0,
            trendsCount: {
                uptrend: 0,
                downtrend: 0,
                sideways: 0
            }
        };
    }
    
    // Calculate basic statistics
    const highest = Math.max(...data.map(d => d.high));
    const lowest = Math.min(...data.map(d => d.low));
    const closes = data.map(d => d.close);
    const average = closes.reduce((a, b) => a + b, 0) / closes.length;
    
    // Calculate volatility (using standard deviation of closing prices)
    const variance = closes.reduce((acc, price) => {
        return acc + Math.pow(price - average, 2);
    }, 0) / closes.length;
    const volatility = Math.sqrt(variance) / average;
    
    // Calculate average volume
    const volumeAvg = data.reduce((acc, d) => acc + d.volume, 0) / data.length;
    
    // Calculate trend statistics
    const trendsCount = {
        uptrend: 0,
        downtrend: 0,
        sideways: 0
    };
    
    // Use closing price change to determine trend
    for (let i = 1; i < data.length; i++) {
        const priceChange = (data[i].close - data[i-1].close) / data[i-1].close;
        if (priceChange > 0.01) { // Increase over 1%
            trendsCount.uptrend++;
        } else if (priceChange < -0.01) { // Decrease over 1%
            trendsCount.downtrend++;
        } else {
            trendsCount.sideways++;
        }
    }
    
    return {
        highest,
        lowest,
        average,
        volatility,
        volumeAvg,
        trendsCount
    };
}

function handlePriceSubscription(ws, exchange) {
    if (!['binance', 'huobi', 'okx'].includes(exchange?.toLowerCase())) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid exchange name'
        }));
        return;
    }
    
    // Set heartbeat detection
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);
    
    // Simulate price update
    const priceInterval = setInterval(async () => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                // Read latest data
                const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
                const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
                const latestData = data[data.length - 1].exchanges[exchange];
                
                ws.send(JSON.stringify({
                    type: 'price',
                    exchange,
                    data: {
                        price: latestData.close,
                        timestamp: Date.now()
                    }
                }));
            } catch (error) {
                logger.error('WebSocket data sending error:', error);
            }
        }
    }, 1000);
    
    // Clean up resources
    ws.on('close', () => {
        clearInterval(pingInterval);
        clearInterval(priceInterval);
    });
}

// Add translation endpoint
router.post('/translate', async (req, res, next) => {
    try {
        const { text, isObject = false } = req.body;
        
        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

        let result;
        if (isObject) {
            result = await translateObject(text);
        } else {
            result = await translateChineseToEnglish(text);
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Translation error:', error);
        next(error);
    }
});

// Export router instead of application
module.exports = router; 