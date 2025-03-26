const axios = require('axios');
const BaseExchange = require('./BaseExchange');
const moment = require('moment');
const { HttpsProxyAgent } = require('https-proxy-agent');

class OKXExchange extends BaseExchange {
    constructor(config) {
        super(config);
        this.name = 'OKX';
        this.baseUrl = 'https://www.okx.com';
        this.backupUrls = [
            'https://www.okx.com',     // Main domain
            'https://aws.okx.com',     // AWS server
            'https://okx.com',         // Alternative domain
            'https://api.okx.com'      // API domain
        ];
        this.currentUrlIndex = 0;
        // List of free proxy servers (you may want to replace these with paid proxies)
        this.proxies = [
            'http://51.159.115.233:3128',
            'http://165.225.208.243:10605',
            'http://165.225.208.77:10605',
            'http://165.225.208.243:10605',
            'http://165.225.208.77:10605'
        ];
        this.currentProxyIndex = 0;
    }

    switchEndpoint() {
        this.currentUrlIndex = (this.currentUrlIndex + 1) % (this.backupUrls.length + 1);
        this.baseUrl = this.currentUrlIndex === 0 ? 
            'https://www.okx.com' : 
            this.backupUrls[this.currentUrlIndex - 1];
        console.log(`Switching to OKX API endpoint: ${this.baseUrl}`);
    }

    switchProxy() {
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        const proxy = this.proxies[this.currentProxyIndex];
        console.log(`Switching to proxy: ${proxy}`);
        return proxy;
    }

    async fetchKlines(startTime, endTime) {
        let allData = [];
        let currentStartTime = startTime;
        let failureCount = 0;
        const MAX_FAILURES = 10;

        while (currentStartTime < endTime) {
            try {
                const proxy = this.switchProxy();
                const httpsAgent = new HttpsProxyAgent(proxy);

                // Try direct API endpoint first
                const response = await this.makeRequest(`${this.baseUrl}/api/v5/market/history-candles`, {
                    method: 'get',
                    params: {
                        instId: 'BTC-USDT',
                        bar: '1D',
                        before: moment(endTime).unix(),
                        after: moment(startTime).unix(),
                        limit: 100
                    },
                    headers: {
                        'Accept': 'application/json',
                        'OK-ACCESS-PASSPHRASE': '',  // If authentication is needed
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    httpsAgent,
                    timeout: 30000,
                    validateStatus: function (status) {
                        return status >= 200 && status < 500;
                    }
                });

                if (!response.data || response.data.length === 0) {
                    break;
                }

                allData = allData.concat(response.data);
                currentStartTime = moment(response.data[response.data.length - 1][0]).valueOf() + 1;
                
                // Reset failure count
                failureCount = 0;
                
                // Show progress
                const progress = ((currentStartTime - startTime) / (endTime - startTime) * 100).toFixed(2);
                const currentDate = moment(currentStartTime).format('YYYY-MM-DD');
                console.log(`OKX progress: ${progress}% (Current date: ${currentDate})`);
                
                await this.sleep(1000); // Increase delay between requests
            } catch (error) {
                console.error(`OKX API error: ${error.message}`);
                failureCount++;
                
                if (failureCount >= MAX_FAILURES) {
                    throw new Error('Too many consecutive failures');
                }
                
                this.switchEndpoint();
                // Exponential backoff with jitter
                const backoffTime = Math.min(2000 * Math.pow(2, failureCount) + Math.random() * 1000, 10000);
                console.log(`Waiting ${Math.round(backoffTime/1000)} seconds before retry...`);
                await this.sleep(backoffTime);
            }
        }

        return this.formatData(allData);
    }

    formatData(data) {
        return data.map(item => ({
            date: moment(parseInt(item[0])).format('YYYY-MM-DD'),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5]),
            quoteVolume: parseFloat(item[6])
        }));
    }
}

module.exports = OKXExchange; 