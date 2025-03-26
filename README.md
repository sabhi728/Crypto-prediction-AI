# Crypto Predict AI

crypto-predict-ai is a Bitcoin price data collection, analysis and prediction tool. It uses machine learning models to analyze Bitcoin market trends and supports multiple exchange data sources.

![Analysis Screenshot]

## ✨ Key Features

- 📊 Multi-exchange data collection (Binance, Huobi, OKX)
- 🤖 Machine learning model for market trend prediction
- 📈 Interactive price charts
- 🔄 Automatic data sync and validation
- 📱 Responsive web interface
- 🛡️ Anomaly detection and data validation

## 🚀 Quick Start

### Install Dependencie

```bash
npm install
```

### Configuration

Copy and modify the configuration template:

```bash
cp src/config.example.js src/config.js
```

### Run

```bash
# Full data fetch
npm run fetch:full

# Incremental update
npm run fetch:increment

# Start web server
npm run start:web

# Start scheduler
npm run start:scheduler

# Train model
npm run train
```

## 📊 Data Visualization

Visit `http://localhost:3000` to view interactive charts:

- Candlestick charts
- Volume analysis
- Trend prediction
- Multi-exchange comparison

## 🛠️ Tech Stack

- Node.js
- TensorFlow.js
- Express
- Plotly.js
- Winston
- Node-cron

## 📁 Project Structure

```bash
├── src/
│   ├── exchanges/    # Exchange interfaces
│   ├── ml/          # Machine learning models
│   ├── utils/       # Utility functions
│   ├── config.js    # Configuration file
│   ├── server.js    # Web service
│   └── train.js     # Model training
├── data/            # Data storage
├── models/          # Model storage
├── public/          # Static files
└── reports/         # Analysis reports
```

## 📈 Features

### Data Collection
- [x] Multi-exchange support
- [x] Auto-retry and failover
- [x] Incremental updates
- [x] Data validation

### Data Analysis
- [x] Price trend analysis
- [x] Volume analysis
- [x] Anomaly detection
- [x] Exchange comparison

### Machine Learning
- [x] Market cycle classification
- [x] Trend prediction
- [x] Model training visualization
- [x] Prediction validation

### Web Interface
- [x] Real-time price charts
- [x] Technical indicators
- [x] Prediction results display
- [x] Responsive design

## 📊 API Documentation

### Get Kline Data
GET /api/klines?exchange=binance&timeframe=1D

### Get Predictions

For complete API documentation, see [API.md](docs/API.md)

## ⚙️ Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| API_ENDPOINTS | Exchange API endpoints | [...] |
| INTERVAL | Data time interval | 1d |
| MAX_RETRIES | Maximum retry attempts | 5 |

For more configuration options, see [config.js](src/config.js)

## 🙏 Acknowledgments

- TensorFlow.js team
- API support from various exchanges 