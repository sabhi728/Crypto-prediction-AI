const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const apiService = require('./service');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const port = 3000;

// Static file service
app.use(express.static('public'));

// Use API service routes
app.use('/api', apiService);

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: {
            code: 'SERVER_ERROR',
            message: 'Internal server error'
        }
    });
});

// Create HTTP server
const server = http.createServer(app);

// Start the server
server.listen(port, '0.0.0.0', () => {
    logger.info(`Web server running at http://localhost:${port}`);
});

// Set up WebSocket server
const wss = new WebSocket.Server({ server });
wss.on('error', error => {
    logger.error('WebSocket error:', error);
});

module.exports = app; 