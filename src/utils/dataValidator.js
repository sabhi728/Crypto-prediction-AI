const logger = require('./logger');

class DataValidator {
    validatePriceConsistency(data) {
        const issues = [];
        
        data.forEach(dayData => {
            const exchanges = Object.keys(dayData.exchanges);
            if (exchanges.length > 1) {
                const prices = exchanges.map(e => dayData.exchanges[e].close);
                const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
                const maxDiff = Math.max(...prices) - Math.min(...prices);
                const diffPercent = (maxDiff / avgPrice) * 100;
                
                if (diffPercent > 1) {
                    issues.push({
                        type: 'PRICE_INCONSISTENCY',
                        date: dayData.date,
                        difference: `${diffPercent.toFixed(2)}%`,
                        prices: exchanges.reduce((obj, e) => {
                            obj[e] = dayData.exchanges[e].close;
                            return obj;
                        }, {})
                    });
                }
            }
        });
        
        return issues;
    }

    validateDataContinuity(data) {
        const issues = [];
        const exchanges = new Set();
        
        // Collect all exchanges
        data.forEach(dayData => {
            Object.keys(dayData.exchanges).forEach(e => exchanges.add(e));
        });
        
        // Check data continuity for each exchange
        exchanges.forEach(exchange => {
            let prevDate = null;
            data.forEach(dayData => {
                if (dayData.exchanges[exchange]) {
                    if (prevDate) {
                        const curr = moment(dayData.date);
                        const prev = moment(prevDate);
                        const daysDiff = curr.diff(prev, 'days');
                        
                        if (daysDiff > 1) {
                            issues.push({
                                type: 'DATA_GAP',
                                exchange,
                                startDate: prevDate,
                                endDate: dayData.date,
                                missingDays: daysDiff - 1
                            });
                        }
                    }
                    prevDate = dayData.date;
                }
            });
        });
        
        return issues;
    }

    validateVolumeAnomalies(data) {
        const issues = [];
        const windowSize = 7; // 7-day moving window
        
        data.forEach((dayData, index) => {
            if (index < windowSize) return;
            
            Object.entries(dayData.exchanges).forEach(([exchange, exchangeData]) => {
                const window = data.slice(index - windowSize, index)
                    .map(d => d.exchanges[exchange]?.volume || 0);
                
                const avgVolume = window.reduce((a, b) => a + b, 0) / window.length;
                const stdDev = Math.sqrt(
                    window.reduce((a, b) => a + Math.pow(b - avgVolume, 2), 0) / window.length
                );
                
                const zscore = (exchangeData.volume - avgVolume) / stdDev;
                if (Math.abs(zscore) > 3) { // 3 standard deviations
                    issues.push({
                        type: 'VOLUME_ANOMALY',
                        date: dayData.date,
                        exchange,
                        zscore: zscore.toFixed(2),
                        volume: exchangeData.volume,
                        avgVolume: avgVolume.toFixed(2)
                    });
                }
            });
        });
        
        return issues;
    }
}

module.exports = new DataValidator(); 