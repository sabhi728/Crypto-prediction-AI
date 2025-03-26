module.exports = {
    // Use multiple backup API endpoints
    API_ENDPOINTS: [
        'https://api.binance.com',
        'https://api1.binance.com',
        'https://api2.binance.com',
        'https://api3.binance.com',
        // Add Binance Asia-Pacific region API
        'https://api-apac.binance.com',
        // Add Binance European region API
        'https://api-eu.binance.com'
    ],
    
    // Trading pair
    SYMBOL: 'BTCUSDT',
    
    // Data storage path
    DATA_DIR: './data',
    
    // Time interval (milliseconds in a day)
    INTERVAL: '1d',
    
    // Data limit per request
    LIMIT: 500,
    
    // Add retry configuration
    MAX_RETRIES: 5,
    RETRY_DELAY: 2000,  // Retry delay (milliseconds)
    
    // Add proxy configuration (if needed)
    PROXY: {
        host: 'your-proxy-host',  // Fill in proxy address if needed
        port: 'your-proxy-port'   // Fill in proxy port if needed
    }
}; 