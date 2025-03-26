const Matrix = require('ml-matrix');

class FeatureExtractor {
    constructor() {
        this.WINDOW_SIZE = 270;  // 9 months
        this.TREND_THRESHOLD = 0.50;  // 50% change threshold
        this.MIN_TREND_DAYS = 30;  // Minimum trend duration in days
    }

    // Safe division operation
    safeDivide(a, b) {
        if (b === 0 || isNaN(b) || !isFinite(b)) return 0;
        const result = a / b;
        return isFinite(result) ? result : 0;
    }

    // Safe price change rate calculation
    safeCalculateChange(start, end) {
        if (!start || !end || start === 0) return 0;
        return this.safeDivide(end - start, start);
    }

    createTrainingData(priceData, labeledPeriods) {
        const features = [];
        const labels = [];

        for (let i = this.WINDOW_SIZE; i < priceData.length; i++) {
            // Get current date
            const currentDate = priceData[i].date;
            
            // Get label
            const period = this.findPeriod(currentDate, labeledPeriods);
            if (period) {
                // Extract features
                const windowData = priceData.slice(i - this.WINDOW_SIZE, i);
                const extractedFeatures = this.extractFeatures(windowData);
                
                features.push(extractedFeatures);
                labels.push(period.type);
            }
        }

        return { features, labels };
    }

    extractFeatures(windowData) {
        try {
            const sortedData = windowData.sort((a, b) => new Date(a.date) - new Date(b.date));
            const prices = sortedData.map(d => d.exchanges.Binance?.close || 0).filter(p => p > 0);
            const volumes = sortedData.map(d => d.exchanges.Binance?.volume || 0).filter(v => v > 0);
            
            if (prices.length < this.MIN_TREND_DAYS) {
                console.warn('Data points insufficient:', prices.length);
                return Array(9).fill(0);
            }
            
            let features = [
                this.calculateLongTermChange(prices),
                this.calculateVolatility(prices),
                this.calculatePricePosition(prices),
                this.calculateTrendStrength(prices),
                this.calculateVolumeChange(volumes),
                this.calculateMomentum(prices),
                this.checkTrendContinuity(prices),
                this.calculateTrendConsistency(prices)
            ];
            
            const totalChange = this.safeCalculateChange(prices[0], prices[prices.length - 1]);
            features.push(Math.sign(totalChange));
            
            // Check and correct invalid values
            features = features.map(f => {
                if (isNaN(f) || !isFinite(f)) {
                    console.warn('Invalid feature value detected:', f);
                    return 0;
                }
                return f;
            });
            
            return features;
        } catch (error) {
            console.error('Feature extraction error:', error);
            return Array(9).fill(0);
        }
    }

    // Calculate price change relative to 3 months ago
    calculateLongTermChange(prices) {
        if (prices.length < this.WINDOW_SIZE) return 0;
        const startPrice = prices[0];
        const endPrice = prices[prices.length - 1];
        return this.safeCalculateChange(startPrice, endPrice);
    }

    // Calculate price position relative to 3 months average
    calculatePricePosition(prices) {
        if (prices.length === 0) return 0;
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        if (avg === 0) return 0;
        const currentPrice = prices[prices.length - 1];
        return this.safeDivide(currentPrice - avg, avg);
    }

    // Calculate trend strength
    calculateTrendStrength(prices) {
        if (prices.length < 90) return 0;  // At least 90 days of data is required
        
        const monthSize = Math.floor(prices.length / 9);
        const monthlyChanges = [];
        
        // Calculate monthly change rates
        for (let i = 0; i < 9; i++) {
            const monthPrices = prices.slice(i * monthSize, (i + 1) * monthSize);
            if (monthPrices.length < 2) continue;
            
            const monthChange = this.safeCalculateChange(
                monthPrices[0],
                monthPrices[monthPrices.length - 1]
            );
            monthlyChanges.push(monthChange);
        }
        
        if (monthlyChanges.length === 0) return 0;
        
        let consecutiveUp = 0;
        let consecutiveDown = 0;
        let maxConsecutiveUp = 0;
        let maxConsecutiveDown = 0;
        
        monthlyChanges.forEach(change => {
            if (change > 0) {
                consecutiveUp++;
                consecutiveDown = 0;
                maxConsecutiveUp = Math.max(maxConsecutiveUp, consecutiveUp);
            } else if (change < 0) {
                consecutiveDown++;
                consecutiveUp = 0;
                maxConsecutiveDown = Math.max(maxConsecutiveDown, consecutiveDown);
            }
        });
        
        if (maxConsecutiveUp >= 3) return maxConsecutiveUp / 9;
        if (maxConsecutiveDown >= 3) return -maxConsecutiveDown / 9;
        return 0;
    }

    // Add trend continuity check
    checkTrendContinuity(prices) {
        if (prices.length < 60) return 0;  // At least 60 days of data is required
        
        const changes = [];
        for (let i = 30; i < prices.length; i += 30) {
            const monthChange = this.safeCalculateChange(prices[i-30], prices[i]);
            if (isFinite(monthChange)) {
                changes.push(monthChange);
            }
        }
        
        if (changes.length === 0) return 0;
        
        let continuityScore = 0;
        let previousTrend = null;
        let currentStreak = 0;
        
        changes.forEach(change => {
            const currentTrend = change > this.TREND_THRESHOLD ? 1 : 
                               change < -this.TREND_THRESHOLD ? -1 : 0;
            
            if (previousTrend === null) {
                previousTrend = currentTrend;
                currentStreak = 1;
            } else if (currentTrend === previousTrend) {
                currentStreak++;
            } else {
                if (currentStreak >= 3) {
                    continuityScore += currentStreak;
                }
                currentStreak = 1;
            }
            previousTrend = currentTrend;
        });
        
        return this.safeDivide(continuityScore, changes.length);
    }

    // Modify trend consistency calculation
    calculateTrendConsistency(prices) {
        const quarterSize = Math.floor(prices.length / 3);
        const quarters = Array.from({ length: 3 }, (_, i) => 
            prices.slice(i * quarterSize, (i + 1) * quarterSize)
        );
        
        const changes = quarters.map(quarter => {
            const startPrice = quarter[0];
            const endPrice = quarter[quarter.length - 1];
            return (endPrice - startPrice) / startPrice;
        });
        
        // Require trend continuity
        const isConsistentUptrend = changes.every((c, i) => 
            c > this.TREND_THRESHOLD / 3 && 
            (i === 0 || changes[i-1] > this.TREND_THRESHOLD / 3)
        );
        
        const isConsistentDowntrend = changes.every((c, i) => 
            c < -this.TREND_THRESHOLD / 3 && 
            (i === 0 || changes[i-1] < -this.TREND_THRESHOLD / 3)
        );
        
        if (isConsistentUptrend) return 1;
        if (isConsistentDowntrend) return -1;
        return 0;
    }

    // Calculate momentum
    calculateMomentum(prices) {
        const monthlyChanges = [];
        for (let i = 30; i < prices.length; i += 30) {
            const monthChange = (prices[i] - prices[i-30]) / prices[i-30];
            monthlyChanges.push(monthChange);
        }
        
        // Calculate momentum (change rate of change)
        return monthlyChanges.length > 1 ? 
            monthlyChanges[monthlyChanges.length - 1] - monthlyChanges[monthlyChanges.length - 2] : 
            0;
    }

    // Determine market state
    determinePeriodType(features) {
        const [longTermChange, volatility, pricePosition, trendStrength, volumeChange, momentum, consistency] = features;
        
        // Use multiple indicators to determine
        if (Math.abs(longTermChange) <= this.TREND_THRESHOLD && 
            Math.abs(pricePosition) <= this.TREND_THRESHOLD && 
            volatility <= 0.1) {
            return 3; // Stable period
        }
        
        if (longTermChange > this.TREND_THRESHOLD && 
            trendStrength > 0 && 
            momentum >= 0) {
            return 1; // Rising period
        }
        
        if (longTermChange < -this.TREND_THRESHOLD && 
            trendStrength < 0 && 
            momentum <= 0) {
            return 2; // Falling period
        }
        
        return 3; // Default to stable period
    }

    // Calculate volatility
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const change = this.safeCalculateChange(prices[i-1], prices[i]);
            if (isFinite(change)) {
                returns.push(change);
            }
        }
        return this.standardDeviation(returns);
    }

    // Calculate volume change
    calculateVolumeChange(volumes) {
        if (volumes.length < 2) return 0;
        return this.safeCalculateChange(volumes[0], volumes[volumes.length - 1]);
    }

    // Calculate standard deviation
    standardDeviation(values) {
        if (values.length === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => {
            const diff = value - mean;
            return isFinite(diff) ? Math.pow(diff, 2) : 0;
        });
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    // Find date belongs to period
    findPeriod(date, labeledPeriods) {
        return labeledPeriods.find(period => 
            date >= period.start && date <= period.end
        );
    }
}

module.exports = FeatureExtractor; 