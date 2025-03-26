const tf = require('@tensorflow/tfjs');
const FeatureExtractor = require('./features');

class BTCPeriodClassifier {
    constructor() {
        this.featureExtractor = new FeatureExtractor();
        this.model = null;
    }

    // Create model
    createModel(inputShape) {
        const model = tf.sequential();
        
        // Use more complex architecture to handle more features
        model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            inputShape: [inputShape],  // Dynamically set input dimension
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        model.add(tf.layers.dropout(0.2));  // Add dropout to prevent overfitting
        
        model.add(tf.layers.dense({
            units: 8,
            activation: 'relu',
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        // Output layer
        model.add(tf.layers.dense({
            units: 3,
            activation: 'softmax',
            kernelInitializer: 'heNormal',
            biasInitializer: 'zeros'
        }));
        
        // Use Adam optimizer
        const optimizer = tf.train.adam(0.001);
        
        model.compile({
            optimizer: optimizer,
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
        
        this.model = model;
        return model;
    }

    // Train model
    async train(priceData, labeledPeriods, epochs = 100) {
        const { features, labels } = this.featureExtractor.createTrainingData(
            priceData,
            labeledPeriods
        );
        
        // Get feature dimensions
        const inputShape = features[0].length;
        console.log('Feature dimensions:', inputShape);
        
        // Ensure all feature arrays have consistent length
        const normalizedFeatures = features.map(feature => {
            if (feature.length < inputShape) {
                // If feature count is insufficient, pad with 0
                return [...feature, ...Array(inputShape - feature.length).fill(0)];
            }
            if (feature.length > inputShape) {
                // If feature count is too high, truncate
                return feature.slice(0, inputShape);
            }
            return feature;
        });
        
        // Print feature and label shapes
        console.log('Feature count:', normalizedFeatures.length);
        console.log('Label count:', labels.length);
        console.log('Feature example:', normalizedFeatures[0]);
        
        if (!this.model) {
            this.createModel(inputShape);
        }
        
        // Convert features to tensor
        const xs = tf.tensor2d(normalizedFeatures);
        const ys = tf.oneHot(tf.tensor1d(labels.map(l => l - 1), 'int32'), 3);
        
        // Print tensor shapes
        console.log('Feature tensor shape:', xs.shape);
        console.log('Label tensor shape:', ys.shape);
        
        try {
            // Train model
            const history = await this.model.fit(xs, ys, {
                epochs,
                batchSize: 32,
                validationSplit: 0.2,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        console.log(
                            `Epoch ${epoch + 1}: ` +
                            `loss = ${logs.loss.toFixed(4)}, ` +
                            `accuracy = ${logs.acc.toFixed(4)}, ` +
                            `val_loss = ${logs.val_loss.toFixed(4)}, ` +
                            `val_accuracy = ${logs.val_acc.toFixed(4)}`
                        );
                    }
                }
            });
            
            // Clean up memory
            xs.dispose();
            ys.dispose();
            
            return history;
        } catch (error) {
            // Clean up memory
            xs.dispose();
            ys.dispose();
            throw error;
        }
    }

    // Predict
    async predict(windowData) {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        
        try {
            // Extract features
            const features = this.featureExtractor.extractFeatures(windowData);
            
            // Ensure feature dimension is correct
            const inputShape = this.model.inputs[0].shape[1];
            if (features.length !== inputShape) {
                while (features.length < inputShape) {
                    features.push(0);
                }
                if (features.length > inputShape) {
                    features.length = inputShape;
                }
            }
            
            // Check if features contain invalid values
            if (features.some(f => isNaN(f) || !isFinite(f))) {
                console.warn('Features contain invalid values:', features);
                return {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            // Convert to tensor and predict
            const xs = tf.tensor2d([features]);
            const prediction = this.model.predict(xs);
            const probabilities = await prediction.data();
            
            // Add trend smoothing logic
            const trendStrength = features[3];  // Trend strength feature
            const continuityScore = features[6];  // Trend continuity feature
            
            let smoothedPrediction = {
                uptrend: Math.max(0.001, probabilities[0]),    // Ensure not zero
                downtrend: Math.max(0.001, probabilities[1]),  // Ensure not zero
                sideways: Math.max(0.001, probabilities[2])    // Ensure not zero
            };
            
            // If there's a strong trend, enhance the probability of the dominant trend
            if (!isNaN(trendStrength) && !isNaN(continuityScore) && 
                Math.abs(trendStrength) > 0.5 && continuityScore > 0.6) {
                if (trendStrength > 0) {
                    smoothedPrediction.uptrend = Math.max(smoothedPrediction.uptrend, 0.8);
                    smoothedPrediction.downtrend = Math.min(smoothedPrediction.downtrend * 0.2, 0.1);
                    smoothedPrediction.sideways = Math.min(smoothedPrediction.sideways * 0.2, 0.1);
                } else {
                    smoothedPrediction.downtrend = Math.max(smoothedPrediction.downtrend, 0.8);
                    smoothedPrediction.uptrend = Math.min(smoothedPrediction.uptrend * 0.2, 0.1);
                    smoothedPrediction.sideways = Math.min(smoothedPrediction.sideways * 0.2, 0.1);
                }
            }
            
            // Normalize probabilities to ensure no division by zero
            const total = Object.values(smoothedPrediction).reduce((a, b) => a + b, 0);
            if (total > 0) {
                Object.keys(smoothedPrediction).forEach(key => {
                    smoothedPrediction[key] = smoothedPrediction[key] / total;
                });
            } else {
                // If sum is zero, return average distribution
                console.warn('Invalid prediction result, using default values');
                smoothedPrediction = {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            // Free memory
            xs.dispose();
            prediction.dispose();
            
            // Check if final result is valid
            if (Object.values(smoothedPrediction).some(v => isNaN(v) || !isFinite(v))) {
                console.warn('Invalid prediction result, using default values');
                return {
                    uptrend: 0.33,
                    downtrend: 0.33,
                    sideways: 0.34
                };
            }
            
            return smoothedPrediction;
        } catch (error) {
            console.error('Error during prediction:', error);
            return {
                uptrend: 0.33,
                downtrend: 0.33,
                sideways: 0.34
            };
        }
    }

    // Save model
    async saveModel(path) {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        await this.model.save(`file://${path}`);
    }

    // Load model
    async loadModel(path) {
        this.model = await tf.loadLayersModel(`file://${path}`);
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });
    }
}

module.exports = BTCPeriodClassifier; 