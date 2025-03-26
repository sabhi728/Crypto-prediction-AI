{
    "date": "2023-12-19",
    "open": 42000.50,
    "high": 43000.00,
    "low": 41500.00,
    "close": 42500.75,
    "volume": 1234.56,        // Volume in BTC
    "trades": 50000,          // Number of trades
    "quoteVolume": 52123456,  // Trading volume in USDT
    "avgPrice": 42220.45,     // Average trading price USDT/BTC
    "avgTradeSize": 0.02469   // Average trade size BTC/trade
}

This is the Binance Kline data format. Let me explain the meaning of each field:
[
    1732060800000,      // [0] Opening timestamp (milliseconds)
    "92310.80000000",   // [1] Opening price (Open)
    "94831.97000000",   // [2] Highest price (High)
    "91500.00000000",   // [3] Lowest price (Low)
    "94286.56000000",   // [4] Closing price (Close)
    "42203.19871200",   // [5] Trading volume (Volume)
    1732147199999,      // [6] Closing timestamp (milliseconds)
    "3950932314.64606898", // [7] Quote asset volume
    7365987,            // [8] Number of trades
    "20425.30796200",   // [9] Taker buy volume
    "1912348704.24726208", // [10] Taker buy quote volume
    "0"                 // [11] Ignore this field
]