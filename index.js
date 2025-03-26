const BinanceExchange = require('./src/exchanges/BinanceExchange');
const OKXExchange = require('./src/exchanges/OKXExchange');
const HuobiExchange = require('./src/exchanges/HuobiExchange');
const { saveData } = require('./src/utils');
const moment = require('moment');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs').promises;
const path = require('path');

async function fetchExchangeData(exchange, startTime, endTime) {
    console.log(`\nStarting to fetch Bitcoin historical data from ${exchange.name}...`);
    const data = await exchange.fetchKlines(startTime, endTime);
    
    // Save data
    const filename = `btc_price_${exchange.name.toLowerCase()}_${moment(startTime).format('YYYYMMDD')}_${moment(endTime).format('YYYYMMDD')}.json`;
    await saveData(data, filename);
    
    console.log(`Data collection completed for ${exchange.name}, total ${data.length} records`);
    // Return with exchange information
    return {
        name: exchange.name,
        data: data
    };
}

function mergeExchangeData(results) {
    const mergedMap = new Map();
    
    results.forEach(result => {
        if (!result || !result.data) return;
        
        // Use result.data instead of result directly
        result.data.forEach(dayData => {
            if (!mergedMap.has(dayData.date)) {
                mergedMap.set(dayData.date, {
                    date: dayData.date,
                    exchanges: {}
                });
            }
            // Use result.name as exchange name
            mergedMap.get(dayData.date).exchanges[result.name] = dayData;
        });
    });
    
    // Convert results to array and sort by date
    return Array.from(mergedMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Add data validation function
function validateData(mergedData) {
    const validationResults = {
        valid: [],
        anomalies: {
            priceDiff: [],      // Price difference anomalies
            volumeSpikes: [],    // Volume anomalies
            dataMissing: [],     // Missing data
            priceGaps: []        // Price gaps
        },
        stats: {
            totalDays: 0,
            validDays: 0,
            exchangeCoverage: {}
        }
    };

    // Iterate through daily data
    mergedData.forEach((dayData, index) => {
        const exchanges = Object.keys(dayData.exchanges);
        let isValidDay = true;
        
        // 1. Basic data completeness check
        const dataCompleteness = exchanges.every(exchange => {
            const data = dayData.exchanges[exchange];
            return data && 
                   !isNaN(data.open) && 
                   !isNaN(data.high) && 
                   !isNaN(data.low) && 
                   !isNaN(data.close) && 
                   !isNaN(data.volume);
        });

        if (!dataCompleteness) {
            validationResults.anomalies.dataMissing.push({
                date: dayData.date,
                exchanges: exchanges
            });
            isValidDay = false;
        }

        // 2. Price anomaly check
        if (exchanges.length > 1) {
            const prices = exchanges.map(e => dayData.exchanges[e].close);
            const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
            const maxDiff = Math.max(...prices) - Math.min(...prices);
            const diffPercent = (maxDiff / avgPrice) * 100;

            // If price difference between exchanges exceeds 1%
            if (diffPercent > 1) {
                validationResults.anomalies.priceDiff.push({
                    date: dayData.date,
                    exchanges: exchanges,
                    maxDiff,
                    diffPercent
                });
                isValidDay = false;
            }
        }

        // 3. Volume spike check
        exchanges.forEach(exchange => {
            const data = dayData.exchanges[exchange];
            const volume = data.volume;
            const avgVolume = calculateAverageVolume(mergedData, exchange, index);
            
            // If volume is more than 3 times the average
            if (volume > avgVolume * 3) {
                validationResults.anomalies.volumeSpikes.push({
                    date: dayData.date,
                    exchange,
                    volume,
                    avgVolume
                });
                isValidDay = false;
            }
        });

        // 4. Price gap check
        if (index > 0) {
            exchanges.forEach(exchange => {
                const prevData = mergedData[index - 1].exchanges[exchange];
                const currData = dayData.exchanges[exchange];
                
                if (prevData && currData) {
                    const prevClose = prevData.close;
                    const currOpen = currData.open;
                    const gapPercent = Math.abs((currOpen - prevClose) / prevClose) * 100;
                    
                    // If price gap exceeds 5%
                    if (gapPercent > 5) {
                        validationResults.anomalies.priceGaps.push({
                            date: dayData.date,
                            exchange,
                            gapPercent,
                            prevClose,
                            currOpen
                        });
                        isValidDay = false;
                    }
                }
            });
        }

        // Update statistics
        validationResults.stats.totalDays++;
        if (isValidDay) {
            validationResults.valid.push(dayData);
            validationResults.stats.validDays++;
            
            // Update exchange coverage
            exchanges.forEach(exchange => {
                if (!validationResults.stats.exchangeCoverage[exchange]) {
                    validationResults.stats.exchangeCoverage[exchange] = 0;
                }
                validationResults.stats.exchangeCoverage[exchange]++;
            });
        }
    });

    return validationResults;
}

// Helper function to calculate average volume
function calculateAverageVolume(data, exchange, currentIndex) {
    const windowSize = 30; // Use 30 days as window
    const startIndex = Math.max(0, currentIndex - windowSize);
    const volumes = data.slice(startIndex, currentIndex)
        .map(d => d.exchanges[exchange]?.volume)
        .filter(v => v !== undefined);
    
    return volumes.length > 0 ? 
        volumes.reduce((a, b) => a + b) / volumes.length : 
        0;
}

// Add statistical analysis function
function analyzeData(mergedData) {
    const analysis = {
        price: {
            highest: { value: 0, date: '', exchange: '' },
            lowest: { value: Infinity, date: '', exchange: '' },
            averages: {},  // Average price for each exchange
            volatility: {} // Price volatility for each exchange
        },
        volume: {
            highest: { value: 0, date: '', exchange: '' },
            daily: {},     // Daily volume for each exchange
            total: {},     // Total volume for each exchange
            marketShare: {} // Market share for each exchange
        },
        trends: {
            upDays: {},    // Up days
            downDays: {},  // Down days
            flatDays: {},  // Flat days
            maxUpStreak: {},   // Longest consecutive up streak
            maxDownStreak: {}  // Longest consecutive down streak
        },
        timeStats: {
            byYear: {},    // Annual statistics
            byMonth: {},   // Monthly statistics
            byWeekday: {}  // Weekly statistics
        }
    };

    // Iterate through data for statistics
    mergedData.forEach((dayData, index) => {
        const exchanges = Object.keys(dayData.exchanges);
        
        exchanges.forEach(exchange => {
            const data = dayData.exchanges[exchange];
            
            // 1. Price statistics
            if (data.close > analysis.price.highest.value) {
                analysis.price.highest = {
                    value: data.close,
                    date: dayData.date,
                    exchange
                };
            }
            if (data.close < analysis.price.lowest.value) {
                analysis.price.lowest = {
                    value: data.close,
                    date: dayData.date,
                    exchange
                };
            }
            
            // Calculate price data for each exchange
            if (!analysis.price.averages[exchange]) {
                analysis.price.averages[exchange] = {
                    sum: 0,
                    count: 0,
                    prices: [] // Used for calculating volatility
                };
            }
            analysis.price.averages[exchange].sum += data.close;
            analysis.price.averages[exchange].count++;
            analysis.price.averages[exchange].prices.push(data.close);

            // 2. Volume statistics
            if (!analysis.volume.daily[exchange]) {
                analysis.volume.daily[exchange] = {
                    sum: 0,
                    count: 0
                };
            }
            analysis.volume.daily[exchange].sum += data.volume;
            analysis.volume.daily[exchange].count++;
            
            if (data.volume > analysis.volume.highest.value) {
                analysis.volume.highest = {
                    value: data.volume,
                    date: dayData.date,
                    exchange
                };
            }

            // 3. Trend statistics
            if (!analysis.trends.upDays[exchange]) {
                analysis.trends.upDays[exchange] = 0;
                analysis.trends.downDays[exchange] = 0;
                analysis.trends.flatDays[exchange] = 0;
                analysis.trends.maxUpStreak[exchange] = 0;
                analysis.trends.maxDownStreak[exchange] = 0;
            }

            if (index > 0) {
                const prevDay = mergedData[index - 1].exchanges[exchange];
                if (prevDay) {
                    const priceChange = data.close - prevDay.close;
                    if (priceChange > 0) analysis.trends.upDays[exchange]++;
                    else if (priceChange < 0) analysis.trends.downDays[exchange]++;
                    else analysis.trends.flatDays[exchange]++;
                }
            }

            // 4. Time dimension statistics
            const date = moment(dayData.date);
            const year = date.format('YYYY');
            const month = date.format('YYYY-MM');
            const weekday = date.format('dddd');

            // Annual statistics
            if (!analysis.timeStats.byYear[year]) {
                analysis.timeStats.byYear[year] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0,
                    volatility: []
                };
            }
            analysis.timeStats.byYear[year].avgPrice.sum += data.close;
            analysis.timeStats.byYear[year].avgPrice.count++;
            analysis.timeStats.byYear[year].totalVolume += data.volume;
            analysis.timeStats.byYear[year].volatility.push(data.close);

            // Monthly statistics
            if (!analysis.timeStats.byMonth[month]) {
                analysis.timeStats.byMonth[month] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0
                };
            }
            analysis.timeStats.byMonth[month].avgPrice.sum += data.close;
            analysis.timeStats.byMonth[month].avgPrice.count++;
            analysis.timeStats.byMonth[month].totalVolume += data.volume;

            // Weekly statistics
            if (!analysis.timeStats.byWeekday[weekday]) {
                analysis.timeStats.byWeekday[weekday] = {
                    avgPrice: { sum: 0, count: 0 },
                    totalVolume: 0
                };
            }
            analysis.timeStats.byWeekday[weekday].avgPrice.sum += data.close;
            analysis.timeStats.byWeekday[weekday].avgPrice.count++;
            analysis.timeStats.byWeekday[weekday].totalVolume += data.volume;
        });
    });

    // Calculate final statistics
    // 1. Calculate volatility
    Object.keys(analysis.price.averages).forEach(exchange => {
        const prices = analysis.price.averages[exchange].prices;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push(Math.log(prices[i] / prices[i-1]));
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        analysis.price.volatility[exchange] = Math.sqrt(variance * 252) * 100; // Annualized volatility
    });

    // 2. Calculate market share
    const totalVolume = Object.values(analysis.volume.daily).reduce((sum, data) => sum + data.sum, 0);
    Object.keys(analysis.volume.daily).forEach(exchange => {
        analysis.volume.marketShare[exchange] = (analysis.volume.daily[exchange].sum / totalVolume * 100).toFixed(2) + '%';
    });

    return analysis;
}

// Add function to get latest data date
async function getLatestDataDate() {
    try {
        // Read validated data file
        const validatedPath = path.join(__dirname, 'data', 'btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(validatedPath, 'utf8'));
        
        if (data && data.length > 0) {
            // Return date of last data point
            return moment(data[data.length - 1].date);
        }
    } catch (error) {
        console.log('No existing data found, will perform full retrieval');
    }
    return null;
}

// Add data merge function
async function mergeWithExistingData(newData) {
    try {
        const validatedPath = path.join(__dirname, 'data', 'btc_price_validated.json');
        const existingData = JSON.parse(await fs.readFile(validatedPath, 'utf8'));
        
        // Create date index
        const dateIndex = new Map(existingData.map(item => [item.date, item]));
        
        // Merge new data
        newData.forEach(item => {
            dateIndex.set(item.date, item);
        });
        
        // Convert back to array and sort
        return Array.from(dateIndex.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (error) {
        console.log('No existing data found, returning new data');
        return newData;
    }
}

async function main() {
    try {
        // Parse command line arguments
        const argv = yargs(hideBin(process.argv))
            .option('mode', {
                alias: 'm',
                type: 'string',
                description: 'Retrieval mode: full or increment',
                default: 'full'
            })
            .argv;

        const endTime = new Date().getTime();
        let startTime;

        if (argv.mode === 'increment') {
            // Get latest data date
            const latestDate = await getLatestDataDate();
            if (latestDate) {
                startTime = latestDate.add(1, 'day').valueOf();
                console.log(`Increment retrieval, start date: ${moment(startTime).format('YYYY-MM-DD')}`);
            } else {
                startTime = moment('2017-07-01').valueOf();
                console.log('No existing data found, will perform full retrieval');
            }
        } else {
            startTime = moment('2017-07-01').valueOf();
            console.log('Performing full data retrieval');
        }

        // Skip OKX Exchange due to connection issues
        const exchanges = [
            new BinanceExchange(),
            new HuobiExchange()
        ];

        console.log('Note: OKX Exchange has been disabled due to persistent connection issues.');

        // Get data
        const results = await Promise.all(
            exchanges.map(exchange => 
                fetchExchangeData(exchange, startTime, endTime)
                    .catch(error => {
                        console.error(`${exchange.name} data retrieval failed:`, error.message);
                        return null;
                    })
            )
        );

        const validResults = results.filter(result => result !== null);
        if (validResults.length > 0) {
            const mergedData = mergeExchangeData(validResults);
            const validation = validateData(mergedData);
            const analysis = analyzeData(mergedData);

            if (argv.mode === 'increment') {
                // Merge new and old data
                validation.valid = await mergeWithExistingData(validation.valid);
                console.log(`Merged data total records: ${validation.valid.length}`);
            }

            // Save data
            await saveData(validation.valid, 'btc_price_validated.json');
            await saveData(validation.anomalies, 'btc_price_anomalies.json');
            await saveData(analysis, 'btc_price_analysis.json');

            // Print validation statistics
            console.log('\nData validation statistics:');
            console.log(`Total days: ${validation.stats.totalDays}`);
            console.log(`Valid days: ${validation.stats.validDays}`);
            console.log(`Data completeness rate: ${((validation.stats.validDays / validation.stats.totalDays) * 100).toFixed(2)}%`);
            
            console.log('\nExchange data coverage:');
            Object.entries(validation.stats.exchangeCoverage).forEach(([exchange, days]) => {
                console.log(`${exchange}: ${((days / validation.stats.totalDays) * 100).toFixed(2)}%`);
            });
            
            console.log('\nAnomaly statistics:');
            console.log(`Price difference anomalies: ${validation.anomalies.priceDiff.length} records`);
            console.log(`Volume anomalies: ${validation.anomalies.volumeSpikes.length} records`);
            console.log(`Missing data: ${validation.anomalies.dataMissing.length} records`);
            console.log(`Price gaps: ${validation.anomalies.priceGaps.length} records`);
            
            console.log('\nPrice statistics:');
            console.log(`Historical highest: $${analysis.price.highest.value} (${analysis.price.highest.date} on ${analysis.price.highest.exchange})`);
            console.log(`Historical lowest: $${analysis.price.lowest.value} (${analysis.price.lowest.date} on ${analysis.price.lowest.exchange})`);
            
            console.log('\nVolatility statistics:');
            Object.entries(analysis.price.volatility).forEach(([exchange, volatility]) => {
                console.log(`${exchange}: ${volatility.toFixed(2)}%`);
            });
            
            console.log('\nMarket share:');
            Object.entries(analysis.volume.marketShare).forEach(([exchange, share]) => {
                console.log(`${exchange}: ${share}`);
            });
            
            console.log('\nTrend statistics:');
            Object.keys(analysis.trends.upDays).forEach(exchange => {
                const total = analysis.trends.upDays[exchange] + 
                            analysis.trends.downDays[exchange] + 
                            analysis.trends.flatDays[exchange];
                console.log(`\n${exchange}:`);
                console.log(`Up days: ${analysis.trends.upDays[exchange]} (${(analysis.trends.upDays[exchange]/total*100).toFixed(2)}%)`);
                console.log(`Down days: ${analysis.trends.downDays[exchange]} (${(analysis.trends.downDays[exchange]/total*100).toFixed(2)}%)`);
                console.log(`Flat days: ${analysis.trends.flatDays[exchange]} (${(analysis.trends.flatDays[exchange]/total*100).toFixed(2)}%)`);
            });
        }
    } catch (error) {
        console.error('Program execution failed:', error.message);
        process.exit(1);
    }
}

function printComparison(results) {
    console.log('\nExchange data comparison:');
    results.forEach(result => {
        if (result && result.data) {
            console.log(`\n${result.name}:`);
            console.log(`Data records: ${result.data.length}`);
            console.log(`Date range: ${result.data[0].date} to ${result.data[result.data.length-1].date}`);
            
            // Calculate average volume
            const avgVolume = result.data.reduce((sum, d) => sum + d.volume, 0) / result.data.length;
            console.log(`Average volume: ${avgVolume.toFixed(2)} BTC`);
        }
    });
}

main(); 