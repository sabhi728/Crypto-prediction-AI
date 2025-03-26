const BTCPeriodClassifier = require('./ml/model');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

async function validateExchanges() {
    try {
        // Read data
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // Load trained model
        const classifier = new BTCPeriodClassifier();
        const modelPath = path.join(__dirname, '../models/btc_period_classifier/model.json');
        await classifier.loadModel(modelPath);
        
        // Process daily data
        const results = [];
        for (let i = 270; i < data.length; i++) {
            const date = data[i].date;
            const exchanges = data[i].exchanges;
            
            // Prepare data windows for each exchange
            const binanceWindow = data.slice(i - 270, i).map(d => ({
                date: d.date,
                exchanges: {
                    Binance: d.exchanges.Binance
                }
            }));
            
            const huobiWindow = data.slice(i - 270, i).map(d => ({
                date: d.date,
                exchanges: {
                    Binance: {  // Using Huobi data but keeping Binance format
                        date: d.date,
                        open: d.exchanges.Huobi?.open || 0,
                        high: d.exchanges.Huobi?.high || 0,
                        low: d.exchanges.Huobi?.low || 0,
                        close: d.exchanges.Huobi?.close || 0,
                        volume: d.exchanges.Huobi?.volume || 0,
                        trades: d.exchanges.Huobi?.count || 0,  // Huobi uses count instead of trades
                        avgPrice: (d.exchanges.Huobi?.high + d.exchanges.Huobi?.low) / 2 || 0,
                        avgTradeSize: d.exchanges.Huobi?.volume / (d.exchanges.Huobi?.count || 1) || 0
                    }
                }
            }));
            
            // Predict for both Binance and Huobi
            const result = {
                date,
                binance: exchanges.Binance ? {
                    ...exchanges.Binance,
                    prediction: await classifier.predict(binanceWindow)
                } : null,
                huobi: exchanges.Huobi ? {
                    ...exchanges.Huobi,
                    prediction: await classifier.predict(huobiWindow)
                } : null
            };
            
            results.push(result);
            
            // Print progress every 100 days
            if (i % 100 === 0) {
                logger.info(`Progress: ${((i / data.length) * 100).toFixed(2)}%`);
            }
        }
        
        // Save results
        const outputPath = path.join(__dirname, '../data/exchange_predictions.json');
        await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
        logger.info(`Prediction results saved to: ${outputPath}`);
        
        // Generate HTML report
        await generateReport(results);
        
    } catch (error) {
        logger.error('Validation failed:', error);
        // Print more detailed error information
        if (error.stack) {
            logger.error('Error stack:', error.stack);
        }
    }
}

// Modify report generation function, add more visualization options
async function generateReport(results) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>BTC Market Period Analysis</title>
        <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
        <style>
            body { margin: 20px; font-family: Arial, sans-serif; }
            .chart { width: 100%; height: 800px; margin-bottom: 40px; }
            .controls { margin: 20px 0; }
            .status { margin: 10px 0; font-weight: bold; }
            .analysis-result {
                margin: 20px;
                padding: 10px;
                border: 1px solid #ccc;
                max-height: 300px;
                overflow-y: auto;
            }
            .period-list {
                margin: 10px 0;
                font-family: monospace;
            }
        </style>
    </head>
    <body>
        <h1>BTC Market Period Analysis</h1>
        <div class="controls">
            <button onclick="toggleBackground()">Toggle background display</button>
            <button onclick="toggleExchanges()">Toggle exchange display</button>
            <button onclick="analyzePeriods()">Analyze period distribution</button>
            <div id="exchangeStatus" class="status">Currently displaying: Binance & Huobi</div>
        </div>
        <div id="analysisResult" class="analysis-result"></div>
        <div id="trendStats" class="stats"></div>
        <div id="combinedChart" class="chart"></div>
        
        <script>
        const results = ${JSON.stringify(results)};
        let showBackground = true;
        let showBinance = true;
        let showHuobi = true;
        
        function updateExchangeStatus() {
            const status = document.getElementById('exchangeStatus');
            if (showBinance && showHuobi) {
                status.textContent = 'Currently displaying: Binance & Huobi';
            } else if (showBinance) {
                status.textContent = 'Currently displaying: Binance';
            } else if (showHuobi) {
                status.textContent = 'Currently displaying: Huobi';
            }
        }
        
        function toggleExchanges() {
            if (showBinance && showHuobi) {
                showBinance = true;
                showHuobi = false;
            } else if (showBinance) {
                showBinance = false;
                showHuobi = true;
            } else {
                showBinance = true;
                showHuobi = true;
            }
            updateExchangeStatus();
            updateChart();
        }
        
        function createTraces() {
            const dates = results.map(r => r.date);
            const traces = [];
            
            if (showBinance) {
                traces.push({
                    x: dates,
                    open: results.map(r => r.binance?.open),
                    high: results.map(r => r.binance?.high),
                    low: results.map(r => r.binance?.low),
                    close: results.map(r => r.binance?.close),
                    type: 'candlestick',
                    name: 'Binance',
                    increasing: {line: {color: '#00ff00'}},
                    decreasing: {line: {color: '#ff0000'}}
                });
            }
            
            if (showHuobi) {
                traces.push({
                    x: dates,
                    open: results.map(r => r.huobi?.open),
                    high: results.map(r => r.huobi?.high),
                    low: results.map(r => r.huobi?.low),
                    close: results.map(r => r.huobi?.close),
                    type: 'candlestick',
                    name: 'Huobi',
                    increasing: {line: {color: '#00cc00'}},
                    decreasing: {line: {color: '#cc0000'}}
                });
            }
            
            return traces;
        }
        
        function createLayout() {
            const layout = {
                title: {
                    text: 'BTC/USDT Market Analysis (9-Month Trend)',
                    font: { size: 24 }
                },
                yaxis: {
                    title: 'Price (USDT)',
                    autorange: true,
                    type: 'linear'
                },
                xaxis: {
                    title: 'Date',
                    rangeslider: {visible: false}
                },
                legend: {
                    orientation: 'h',
                    y: -0.2
                }
            };
            
            if (showBackground) {
                layout.shapes = results.map((r, i) => {
                    const prediction = showBinance ? r.binance?.prediction : r.huobi?.prediction;
                    if (!prediction) return null;
                    
                    // Increase background transparency contrast
                    let color = 'rgba(128,128,128,0.05)';  // Default gray (stable period) lighter
                    
                    // Use more obvious colors and higher thresholds
                    if (prediction.uptrend > 0.6) {
                        color = 'rgba(0,255,0,0.15)';  // Up trend (green)
                    } else if (prediction.downtrend > 0.6) {
                        color = 'rgba(255,0,0,0.15)';  // Down trend (red)
                    }
                    
                    // Add trend label
                    const label = prediction.uptrend > 0.6 ? 'Up' :
                                 prediction.downtrend > 0.6 ? 'Down' : 'Stable';
                    
                    return {
                        type: 'rect',
                        xref: 'x',
                        yref: 'paper',
                        x0: r.date,
                        x1: results[i+1]?.date || r.date,
                        y0: 0,
                        y1: 1,
                        fillcolor: color,
                        line: {width: 0},
                        // Add label
                        text: label,
                        font: {
                            size: 10,
                            color: 'black'
                        }
                    };
                }).filter(shape => shape !== null);
            }
            
            // Add trend explanation
            layout.annotations = [
                {
                    x: 0,
                    y: 1.1,
                    xref: 'paper',
                    yref: 'paper',
                    text: 'Green background: Up trend | Red background: Down trend | Gray background: Stable period',
                    showarrow: false,
                    font: {
                        size: 14
                    }
                }
            ];
            
            return layout;
        }
        
        function updateChart() {
            Plotly.newPlot('combinedChart', createTraces(), createLayout());
        }
        
        function toggleBackground() {
            showBackground = !showBackground;
            updateChart();
        }
        
        // Add period analysis function
        function analyzePeriods() {
            const analysisDiv = document.getElementById('analysisResult');
            const periods = {
                sideways: [],
                uptrend: [],
                downtrend: []
            };
            
            results.forEach(r => {
                const prediction = showBinance ? r.binance?.prediction : r.huobi?.prediction;
                if (prediction) {
                    const date = r.date;
                    if (prediction.uptrend > 0.6) {
                        periods.uptrend.push(date);
                    } else if (prediction.downtrend > 0.6) {
                        periods.downtrend.push(date);
                    } else {
                        periods.sideways.push(date);
                    }
                }
            });
            
            function findDateRanges(dates) {
                if (dates.length === 0) return [];
                const ranges = [];
                let start = dates[0];
                let prev = dates[0];
                
                for (let i = 1; i < dates.length; i++) {
                    const curr = dates[i];
                    const diffDays = (new Date(curr) - new Date(prev)) / (1000 * 60 * 60 * 24);
                    
                    if (diffDays > 1) {
                        ranges.push([start, prev]);
                        start = curr;
                    }
                    prev = curr;
                }
                ranges.push([start, prev]);
                return ranges;
            }
            
            const exchange = showBinance ? 'Binance' : 'Huobi';
            analysisDiv.innerHTML = \`
                <h3>\${exchange} Market Period Analysis</h3>
                <h4>Stable period (\${periods.sideways.length} days):</h4>
                <div class="period-list">
                    \${findDateRanges(periods.sideways).map(([start, end]) => 
                        \`\${start} to \${end}\`).join('<br>')}
                </div>
                <h4>Up trend (\${periods.uptrend.length} days):</h4>
                <div class="period-list">
                    \${findDateRanges(periods.uptrend).map(([start, end]) => 
                        \`\${start} to \${end}\`).join('<br>')}
                </div>
                <h4>Down trend (\${periods.downtrend.length} days):</h4>
                <div class="period-list">
                    \${findDateRanges(periods.downtrend).map(([start, end]) => 
                        \`\${start} to \${end}\`).join('<br>')}
                </div>
            \`;
            
            console.log('Market period analysis:', {
                exchange,
                sidewaysPeriods: findDateRanges(periods.sideways),
                uptrendPeriods: findDateRanges(periods.uptrend),
                downtrendPeriods: findDateRanges(periods.downtrend)
            });
        }
        
        // Initialize
        updateExchangeStatus();
        updateChart();
        </script>
    </body>
    </html>`;

    const reportPath = path.join(__dirname, '../reports/market_analysis.html');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, html);
    logger.info(`Analysis report generated: ${reportPath}`);
}

// Add trend statistics information
function addTrendStats() {
    const stats = {
        uptrend: 0,
        downtrend: 0,
        sideways: 0,
        total: 0
    };
    
    results.forEach(r => {
        const prediction = showBinance ? r.binance?.prediction : r.huobi?.prediction;
        if (prediction) {
            stats.total++;
            if (prediction.uptrend > 0.6) stats.uptrend++;
            else if (prediction.downtrend > 0.6) stats.downtrend++;
            else stats.sideways++;
        }
    });
    
    const statsDiv = document.getElementById('trendStats');
    statsDiv.innerHTML = `
        <h3>Trend Statistics</h3>
        <p>Up trend: ${((stats.uptrend / stats.total) * 100).toFixed(1)}%</p>
        <p>Down trend: ${((stats.downtrend / stats.total) * 100).toFixed(1)}%</p>
        <p>Stable period: ${((stats.sideways / stats.total) * 100).toFixed(1)}%</p>
    `;
}

validateExchanges(); 