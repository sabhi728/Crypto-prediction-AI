const axios = require('axios');
const dns = require('dns').promises;
const config = require('./config');
const { formatTimestamp } = require('./utils');
const moment = require('moment');

class PriceFetcher {
    constructor() {
        this.currentEndpointIndex = 0;
        this.baseURL = config.API_ENDPOINTS[0];
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Switch to next API endpoint
    switchEndpoint() {
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % config.API_ENDPOINTS.length;
        this.baseURL = config.API_ENDPOINTS[this.currentEndpointIndex];
        console.log(`Switching to API endpoint: ${this.baseURL}`);
    }

    // Check if domain can be resolved
    async checkDNS(hostname) {
        try {
            const domain = hostname.replace('https://', '').replace('http://', '');
            await dns.lookup(domain);
            return true;
        } catch (error) {
            console.error(`DNS resolution failed: ${hostname}`, error.message);
            return false;
        }
    }

    // Get K-line data
    async fetchKlines(startTime = null, endTime = null) {
        return this.makeRequest('/api/v3/klines', {
            symbol: config.SYMBOL,
            interval: config.INTERVAL,
            limit: config.LIMIT,
            startTime,
            endTime
        });
    }

    // Get 24-hour price statistics
    async fetch24hrStats() {
        return this.makeRequest('/api/v3/ticker/24hr', {
            symbol: config.SYMBOL
        });
    }

    // Get latest price
    async fetchCurrentPrice() {
        return this.makeRequest('/api/v3/ticker/price', {
            symbol: config.SYMBOL
        });
    }

    // Get trading depth
    async fetchOrderBook(limit = 100) {
        return this.makeRequest('/api/v3/depth', {
            symbol: config.SYMBOL,
            limit
        });
    }

    // Generic request method
    async makeRequest(endpoint, params) {
        for (let attempt = 0; attempt < config.MAX_RETRIES; attempt++) {
            try {
                // Check if current endpoint is available
                const isAvailable = await this.checkDNS(this.baseURL);
                if (!isAvailable) {
                    this.switchEndpoint();
                    continue;
                }

                const response = await axios.get(`${this.baseURL}${endpoint}`, {
                    params,
                    timeout: 5000,  // Set timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                return response.data;
            } catch (error) {
                console.error(`Attempt ${attempt + 1}/${config.MAX_RETRIES} failed:`, error.message);
                
                if (attempt === config.MAX_RETRIES - 1) {
                    throw new Error(`Failed to fetch data after ${config.MAX_RETRIES} attempts`);
                }

                this.switchEndpoint();
                await this.sleep(config.RETRY_DELAY);
            }
        }
    }

    // Get all data for specified time range
    async fetchAllData(startTime, endTime) {
        let allData = [];
        let currentStartTime = startTime;
        let failureCount = 0;
        const MAX_FAILURES = 10;  // Maximum consecutive failure count

        while (currentStartTime < endTime) {
            try {
                const data = await this.fetchKlines(currentStartTime, endTime);
                if (!data || data.length === 0) {
                    console.log('No more data');
                    break;
                }

                allData = allData.concat(data);
                currentStartTime = new Date(data[data.length - 1][6]).getTime() + 1;
                
                // Reset failure count
                failureCount = 0;
                
                // Calculate and display progress
                const progress = ((currentStartTime - startTime) / (endTime - startTime) * 100).toFixed(2);
                const currentDate = moment(currentStartTime).format('YYYY-MM-DD');
                console.log(`Progress: ${progress}% (Current date: ${currentDate})`);
                
                // Increase delay to avoid triggering frequency limit
                await this.sleep(300);  // Decrease delay to speed up retrieval
                
                // Additional delay after every 100 data points
                if (allData.length % 100 === 0) {
                    console.log('Performing request limit protection delay...');
                    await this.sleep(2000);
                }
            } catch (error) {
                console.error('Failed to fetch data block:', error.message);
                failureCount++;
                
                if (failureCount >= MAX_FAILURES) {
                    console.error('Too many consecutive failures, stopping retrieval');
                    break;
                }
                
                // If failed, increase retry delay
                await this.sleep(5000);
                
                // Try switching endpoint
                this.switchEndpoint();
            }
        }

        return allData;
    }
}

module.exports = PriceFetcher; 