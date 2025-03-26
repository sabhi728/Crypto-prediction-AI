const dns = require('dns').promises;
const https = require('https');
const axios = require('axios');

class BaseExchange {
    constructor(config) {
        this.name = 'Unknown';
        this.baseUrl = '';
        this.config = config;
        // Create custom HTTPS agent with better timeout handling
        this.httpsAgent = new https.Agent({
            keepAlive: true,
            timeout: 30000,  // 30 second timeout
            rejectUnauthorized: false,  // Can be set to false in development environment
            maxSockets: 10,  // Limit concurrent connections
            maxFreeSockets: 5,  // Keep some connections alive
            freeSocketTimeout: 30000  // Keep connections alive for 30 seconds
        });
    }

    // Check if domain is accessible
    async checkDomain(url) {
        try {
            const hostname = new URL(url).hostname;
            await dns.lookup(hostname);
            return true;
        } catch (error) {
            console.error(`DNS lookup failed for ${url}: ${error.message}`);
            return false;
        }
    }

    // Request method with retry mechanism
    async makeRequest(url, options = {}, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                if (!await this.checkDomain(url)) {
                    throw new Error('DNS lookup failed');
                }

                const response = await axios({
                    ...options,
                    url,
                    httpsAgent: this.httpsAgent,
                    timeout: 30000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        ...options.headers
                    },
                    validateStatus: function (status) {
                        return status >= 200 && status < 500; // Accept any status less than 500
                    }
                });
                return response;
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${i + 1}/${maxRetries} failed: ${error.message}`);
                // Exponential backoff with jitter
                const backoffTime = Math.min(2000 * Math.pow(2, i) + Math.random() * 1000, 10000);
                console.log(`Waiting ${Math.round(backoffTime/1000)} seconds before retry...`);
                await this.sleep(backoffTime);
            }
        }
        throw lastError;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchKlines(startTime, endTime) {
        throw new Error('Method not implemented');
    }

    formatData(data) {
        throw new Error('Method not implemented');
    }
}

module.exports = BaseExchange; 