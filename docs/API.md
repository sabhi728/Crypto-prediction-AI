# API Documentation

## Basic Information

- Base URL: `http://localhost:3000/api`
- All requests use HTTP GET method
- Response format: JSON

## Authentication

Some APIs require a token in the Header:

```bash
Authorization: Bearer <your_token>
```

## API List

### 1. Get Kline Data

#### Request

```http
GET /klines
```

#### Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| exchange | string | Yes | Exchange name | binance |
| symbol | string | Yes | Trading pair | BTC/USDT |
| timeframe | string | Yes | Time period | 1d |
| limit | number | No | Number of records to return | 100 |

#### Response

```json
{
  "code": 0,
  "data": [
    {
      "timestamp": 1632960000000,
      "open": "41235.5",
      "high": "41521.8",
      "low": "40988.2",
      "close": "41126.3",
      "volume": "2145.8"
    }
    // ...
  ]
}
```

### 2. Get Prediction Results

#### Request

```http
GET /predict
```

#### Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| symbol | string | Yes | Trading pair | BTC/USDT |
| timeframe | string | No | Prediction period | 1d |

#### Response

```json
{
  "code": 0,
  "data": {
    "prediction": "up",
    "probability": 0.75,
    "nextTarget": 42150.5,
    "timeframe": "24h"
  }
}
```

### 3. Get Market Analysis

#### Request

```http
GET /analysis
```

#### Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| symbol | string | Yes | Trading pair | BTC/USDT |
| type | string | No | Analysis type | trend |

#### Response

```json
{
  "code": 0,
  "data": {
    "trend": "bullish",
    "strength": 0.8,
    "support": 40000,
    "resistance": 42000,
    "indicators": {
      "rsi": 65,
      "macd": "positive"
    }
  }
}
```

## Error Code Description

| Error Code | Description |
|------------|-------------|
| 0 | Success |
| 1001 | Parameter Error |
| 1002 | Authentication Failed |
| 2001 | Data Fetch Failed |
| 2002 | Prediction Failed |
| 5000 | Internal Server Error |

## Usage Limits

- Maximum 60 requests per minute per IP
- Maximum 5 WebSocket connections per IP
- Historical data limited to last 90 days

## Example Code

### Node.js

```javascript
const axios = require('axios');

async function getKlineData() {
  try {
    const response = await axios.get('http://localhost:3000/api/klines', {
      params: {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        timeframe: '1d'
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

### Python

```python
import requests

def get_kline_data():
    try:
        response = requests.get(
            'http://localhost:3000/api/klines',
            params={
                'exchange': 'binance',
                'symbol': 'BTC/USDT',
                'timeframe': '1d'
            }
        )
        return response.json()
    except Exception as e:
        print(f'Error: {str(e)}')
```

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
```

### Subscribe to Real-time Data

```javascript
ws.send(JSON.stringify({
  event: 'subscribe',
  channel: 'kline',
  symbol: 'BTC/USDT',
  timeframe: '1m'
}));
```

### Message Format

```javascript
{
  event: 'kline',
  data: {
    symbol: 'BTC/USDT',
    timestamp: 1632960000000,
    price: 41235.5
  }
}
```

## Changelog

### v1.0.0 (2024-12-31)
- Initial release
- Basic Kline data retrieval support
- Prediction functionality support