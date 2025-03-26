const axios = require('axios');
const BaseExchange = require('./BaseExchange');
const moment = require('moment');

class HuobiExchange extends BaseExchange {
    constructor(config) {
        super(config);
        this.name = 'Huobi';
        this.baseUrl = 'https://api.huobi.pro';
        this.backupUrls = [
            'https://api-aws.huobi.pro',
            'https://api.huobi.com'
        ];
        this.currentUrlIndex = 0;
    }

    switchEndpoint() {
        this.currentUrlIndex = (this.currentUrlIndex + 1) % (this.backupUrls.length + 1);
        this.baseUrl = this.currentUrlIndex === 0 ? 
            'https://api.huobi.pro' : 
            this.backupUrls[this.currentUrlIndex - 1];
        console.log(`Switching to Huobi API endpoint: ${this.baseUrl}`);
    }

    async fetchKlines(startTime, endTime) {
        let failureCount = 0;
        const MAX_FAILURES = 5;

        while (failureCount < MAX_FAILURES) {
            try {
                const response = await axios.get(`${this.baseUrl}/market/history/kline`, {
                    params: {
                        symbol: 'btcusdt',
                        period: '1day',
                        size: 2000
                    },
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json'
                    }
                });

                if (response && response.data && response.data.data) {
                    return this.formatData(response.data.data);
                }
                throw new Error('Invalid response format');
            } catch (error) {
                failureCount++;
                console.error(`Huobi API error (attempt ${failureCount}/${MAX_FAILURES}):`, error.message);
                
                if (failureCount >= MAX_FAILURES) {
                    throw error;
                }
                
                this.switchEndpoint();
                await new Promise(resolve => setTimeout(resolve, 2000 * failureCount));
            }
        }
    }

    formatData(data) {
        if (!Array.isArray(data)) {
            console.error('Invalid data format from Huobi API:', data);
            return [];
        }
        
        return data.map(item => ({
            date: moment(item.id * 1000).format('YYYY-MM-DD'),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.amount),
            quoteVolume: parseFloat(item.vol),
            count: parseInt(item.count)
        })).filter(item => {
            return !isNaN(item.open) && !isNaN(item.high) && 
                   !isNaN(item.low) && !isNaN(item.close) && 
                   !isNaN(item.volume);
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HuobiExchange; 