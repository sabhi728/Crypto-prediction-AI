const BTCPeriodClassifier = require('./ml/model');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

// Define marked periods
const labeledPeriods = [
    { start: '2017-08-17', end: '2017-11-12', type: 3 }, // Stable period
    { start: '2017-11-13', end: '2017-12-17', type: 1 }, // Uptrend period
    { start: '2017-12-18', end: '2018-02-06', type: 2 }, // Downtrend period
    { start: '2018-02-07', end: '2020-12-15', type: 3 }, // Stable period
    { start: '2020-12-16', end: '2021-04-14', type: 1 }, // Uptrend period
    { start: '2021-04-15', end: '2021-07-21', type: 2 }, // Downtrend period
    { start: '2021-07-22', end: '2021-11-08', type: 1 }, // Uptrend period
    { start: '2021-11-09', end: '2022-06-18', type: 2 }, // Downtrend period
    { start: '2022-06-19', end: '2023-10-16', type: 3 }, // Stable period
    { start: '2023-10-17', end: '2024-03-14', type: 1 }, // Uptrend period
    { start: '2024-03-15', end: '2024-11-06', type: 3 }, // Stable period
    { start: '2024-11-07', end: '2024-12-20', type: 1 }  // Uptrend period
];

// Add training progress visualization
function drawProgressBar(progress, total, length = 50) {
    const filledLength = Math.round(length * progress / total);
    const empty = length - filledLength;
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(empty);
    return `[${progressBar}] ${Math.round((progress/total) * 100)}%`;
}

// Add loss and accuracy charts
function drawChart(values, width = 50, height = 10) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const chart = Array(height).fill().map(() => Array(width).fill(' '));
    
    // Plot data points
    values.slice(-width).forEach((value, x) => {
        const y = Math.floor((height - 1) * (1 - (value - min) / range));
        chart[y][x] = '•';
    });
    
    // Add border
    return '┌' + '─'.repeat(width) + '┐\n' +
           chart.map(row => '│' + row.join('') + '│').join('\n') +
           '\n└' + '─'.repeat(width) + '┘';
}

async function trainModel() {
    try {
        // Read data
        const dataPath = path.join(__dirname, '../data/btc_price_validated.json');
        const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
        
        // Create classifier
        const classifier = new BTCPeriodClassifier();
        
        // Store training history
        const history = {
            loss: [],
            accuracy: [],
            val_loss: [],
            val_accuracy: []
        };
        
        // Training configuration
        const epochs = 100;
        console.log('\n=== Start Training ===\n');
        
        // Train model
        await classifier.train(data, labeledPeriods, epochs, {
            onEpochBegin: (epoch) => {
                process.stdout.write('\x1Bc');  // Clear screen
                console.log(`Epoch ${epoch + 1}/${epochs}`);
                console.log(drawProgressBar(epoch + 1, epochs));
            },
            onEpochEnd: (epoch, logs) => {
                // Update history record
                history.loss.push(logs.loss);
                history.accuracy.push(logs.acc);
                history.val_loss.push(logs.val_loss);
                history.val_accuracy.push(logs.val_acc);
                
                // Draw loss value chart
                console.log('\nLoss value trend:');
                console.log(drawChart(history.loss));
                
                // Draw accuracy trend chart
                console.log('\nAccuracy trend:');
                console.log(drawChart(history.accuracy));
                
                // Print current indicators
                console.log(`\nLoss value: ${logs.loss.toFixed(4)}`);
                console.log(`Accuracy: ${(logs.acc * 100).toFixed(2)}%`);
                console.log(`Validation loss value: ${logs.val_loss.toFixed(4)}`);
                console.log(`Validation accuracy: ${(logs.val_acc * 100).toFixed(2)}%`);
                
                // Save training history
                fs.writeFile(
                    path.join(__dirname, '../data/training_history.json'),
                    JSON.stringify(history, null, 2)
                ).catch(console.error);
            }
        });
        
        // Save model
        const modelPath = path.join(__dirname, '../models/btc_period_classifier');
        await fs.mkdir(modelPath, { recursive: true });
        await classifier.saveModel(modelPath);
        
        // Generate training report
        await generateTrainingReport(history);
        
        // Test prediction
        const latestData = data.slice(-30);
        const prediction = await classifier.predict(latestData);
        
        console.log('\n=== Training completed ===\n');
        console.log('Current market state prediction:');
        console.log(`Uptrend probability: ${(prediction.uptrend * 100).toFixed(2)}%`);
        console.log(`Downtrend probability: ${(prediction.downtrend * 100).toFixed(2)}%`);
        console.log(`Stable probability: ${(prediction.sideways * 100).toFixed(2)}%`);
        
    } catch (error) {
        logger.error('Training failed:', error);
    }
}

async function generateTrainingReport(history) {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Training report</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .chart { width: 100%; height: 400px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <h1>Model training report</h1>
            
            <h2>Loss value trend</h2>
            <div id="lossChart" class="chart"></div>
            
            <h2>Accuracy trend</h2>
            <div id="accuracyChart" class="chart"></div>
            
            <script>
                const history = ${JSON.stringify(history)};
                
                // Draw loss value chart
                Plotly.newPlot('lossChart', [
                    {
                        y: history.loss,
                        name: 'Training loss value',
                        type: 'scatter'
                    },
                    {
                        y: history.val_loss,
                        name: 'Validation loss value',
                        type: 'scatter'
                    }
                ], {
                    title: 'Loss value trend',
                    xaxis: { title: 'Epoch' },
                    yaxis: { title: 'Loss' }
                });
                
                // Draw accuracy trend chart
                Plotly.newPlot('accuracyChart', [
                    {
                        y: history.accuracy,
                        name: 'Training accuracy',
                        type: 'scatter'
                    },
                    {
                        y: history.val_accuracy,
                        name: 'Validation accuracy',
                        type: 'scatter'
                    }
                ], {
                    title: 'Accuracy trend',
                    xaxis: { title: 'Epoch' },
                    yaxis: { title: 'Accuracy' }
                });
            </script>
        </body>
        </html>
    `;
    
    const reportPath = path.join(__dirname, '../reports/training_report.html');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, html);
    logger.info(`Training report generated: ${reportPath}`);
}

trainModel(); 