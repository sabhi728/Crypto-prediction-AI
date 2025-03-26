const translate = require('@vitalets/google-translate-api');

/**
 * Translates Chinese text to English
 * @param {string} text - The Chinese text to translate
 * @returns {Promise<string>} The translated English text
 */
async function translateChineseToEnglish(text) {
    try {
        const result = await translate(text, {
            from: 'zh',
            to: 'en'
        });
        return result.text;
    } catch (error) {
        console.error('Translation error:', error);
        throw new Error('Failed to translate text');
    }
}

/**
 * Translates an object containing Chinese text to English
 * @param {Object} obj - The object containing Chinese text
 * @returns {Promise<Object>} The object with translated English text
 */
async function translateObject(obj) {
    const translatedObj = {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            translatedObj[key] = await translateChineseToEnglish(value);
        } else if (typeof value === 'object' && value !== null) {
            translatedObj[key] = await translateObject(value);
        } else {
            translatedObj[key] = value;
        }
    }
    
    return translatedObj;
}

module.exports = {
    translateChineseToEnglish,
    translateObject
}; 