const axios = require('axios');
const BaseExchange = require('./BaseExchange');
const moment = require('moment');

class BinanceExchange extends BaseExchange {
    constructor(config) {
        super(config);
        this.name = 'Binance';
        this.baseUrl = 'https://api.binance.com';
        this.backupUrls = [
            'https://api1.binance.com',
            'https://api2.binance.com',
            'https://api3.binance.com',
            'https://api4.binance.com'
        ];
        this.currentUrlIndex = 0;
    }

    switchEndpoint() {
        this.currentUrlIndex = (this.currentUrlIndex + 1) % (this.backupUrls.length + 1);
        this.baseUrl = this.currentUrlIndex === 0 ? 
            'https://api.binance.com' : 
            this.backupUrls[this.currentUrlIndex - 1];
        console.log(`Switching to API endpoint: ${this.baseUrl}`);
    }

    async fetchKlines(startTime, endTime) {
        let allData = [];
        let currentStartTime = startTime;
        let failureCount = 0;
        const MAX_FAILURES = 10;

        while (currentStartTime < endTime) {
            try {
                const response = await axios.get(`${this.baseUrl}/api/v3/klines`, {
                    params: {
                        symbol: 'BTCUSDT',
                        interval: '1d',
                        limit: 1000,
                        startTime: currentStartTime,
                        endTime: endTime
                    },
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (!response.data || response.data.length === 0) {
                    break;
                }

                allData = allData.concat(response.data);
                currentStartTime = response.data[response.data.length - 1][6] + 1;
                
                // Reset failure count
                failureCount = 0;
                
                // Show progress
                const progress = ((currentStartTime - startTime) / (endTime - startTime) * 100).toFixed(2);
                const currentDate = moment(currentStartTime).format('YYYY-MM-DD');
                console.log(`Binance progress: ${progress}% (Current date: ${currentDate})`);
                
                await this.sleep(300);
            } catch (error) {
                console.error(`Binance API error: ${error.message}`);
                failureCount++;
                
                if (failureCount >= MAX_FAILURES) {
                    throw new Error('Too many consecutive failures');
                }
                
                this.switchEndpoint();
                await this.sleep(2000);
            }
        }

        return this.formatData(allData);
    }

    formatData(data) {
        return data.map(item => ({
            date: moment(item[0]).format('YYYY-MM-DD'),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5]),
            quoteVolume: parseFloat(item[7]),
            trades: parseInt(item[8]),
            avgPrice: parseFloat(item[7]) / parseFloat(item[5]),
            avgTradeSize: parseFloat(item[5]) / parseInt(item[8])
        }));
    }
}

module.exports = BinanceExchange; 