const OpenAI = require('openai');
const axios = require('axios');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');
const storageService = require('./storageService');

class AIService {
  constructor() {
    this.openai = null;
    this.isEnabled = false;

    if (process.env.OPENAI_API_KEY) {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        this.isEnabled = true;
        logger.info('AI service initialized with OpenAI');
      } catch (error) {
        logger.warn('Failed to initialize OpenAI client:', error.message);
      }
    } else {
      logger.warn('OpenAI API key not provided, AI features will be disabled');
    }
  }

  /**
   * Transcribe audio recording using OpenAI Whisper
   * @param {string} audioUrl - URL of the audio recording
   * @param {string} recordingId - Recording ID for caching
   * @returns {Object} - Transcription result
   */
  async transcribeRecording(audioUrl, recordingId) {
    if (!this.isEnabled || !this.openai) {
      return { success: false, error: 'AI service not available' };
    }

    const cacheKey = `transcription:${recordingId}`;

    // Check cache first
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) {
      logger.info(`Using cached transcription for recording ${recordingId}`);
      return cachedResult;
    }

    try {
      logger.info(`Starting transcription for recording ${recordingId}`);

      // Download audio file
      const audioResponse = await axios.get(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      if (audioResponse.status !== 200) {
        throw new Error(`Failed to download audio: ${audioResponse.status}`);
      }

      // Convert to buffer
      const audioBuffer = Buffer.from(audioResponse.data);

      // Create a readable stream for OpenAI
      const { Readable } = require('stream');
      const audioStream = Readable.from(audioBuffer);

      // Transcribe with Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: 'whisper-1',
        language: 'en', // Can be made configurable
        response_format: 'json'
      });

      const result = {
        success: true,
        transcription: transcription.text,
        recordingId,
        processedAt: new Date().toISOString(),
        model: 'whisper-1'
      };

      // Cache result for 24 hours
      await cacheService.set(cacheKey, result, 24 * 60 * 60);

      logger.info(`Transcription completed for recording ${recordingId}`);
      return result;

    } catch (error) {
      logger.error(`Transcription failed for recording ${recordingId}:`, error);

      const errorResult = {
        success: false,
        error: error.message,
        recordingId,
        processedAt: new Date().toISOString()
      };

      // Cache error result for 1 hour to avoid repeated failures
      await cacheService.set(cacheKey, errorResult, 60 * 60);

      return errorResult;
    }
  }

  /**
   * Analyze transcribed text for sentiment and keywords
   * @param {string} transcription - The transcribed text
   * @param {string} recordingId - Recording ID for caching
   * @returns {Object} - Analysis result
   */
  async analyzeTranscription(transcription, recordingId) {
    if (!this.isEnabled || !this.openai) {
      return { success: false, error: 'AI service not available' };
    }

    if (!transcription || transcription.trim().length === 0) {
      return { success: false, error: 'No transcription provided' };
    }

    const cacheKey = `analysis:${recordingId}`;

    // Check cache first
    const cachedResult = await cacheService.get(cacheKey);
    if (cachedResult) {
      logger.info(`Using cached analysis for recording ${recordingId}`);
      return cachedResult;
    }

    try {
      logger.info(`Starting analysis for recording ${recordingId}`);

      const prompt = `
Analyze this customer delivery instruction transcription and extract key information:

Transcription: "${transcription}"

Please provide:
1. Sentiment analysis (positive, negative, neutral)
2. Key instructions or requirements
3. Any time-sensitive requests (urgent, specific time windows)
4. Special delivery conditions (leave at door, signature required, etc.)
5. Priority level (low, medium, high, urgent)
6. Any concerns or issues mentioned

Format your response as JSON with these keys: sentiment, instructions, time_sensitive, conditions, priority, concerns
      `;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an AI assistant that analyzes customer delivery instructions. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      const analysisText = completion.choices[0].message.content.trim();

      // Parse JSON response
      let analysis;
      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        logger.warn(`Failed to parse AI analysis JSON for recording ${recordingId}:`, parseError);
        // Fallback parsing - extract what we can
        analysis = this.parseFallbackAnalysis(analysisText);
      }

      const result = {
        success: true,
        recordingId,
        transcription,
        analysis,
        processedAt: new Date().toISOString(),
        model: 'gpt-3.5-turbo'
      };

      // Cache result for 24 hours
      await cacheService.set(cacheKey, result, 24 * 60 * 60);

      logger.info(`Analysis completed for recording ${recordingId}`);
      return result;

    } catch (error) {
      logger.error(`Analysis failed for recording ${recordingId}:`, error);

      const errorResult = {
        success: false,
        error: error.message,
        recordingId,
        transcription,
        processedAt: new Date().toISOString()
      };

      // Cache error result for 1 hour
      await cacheService.set(cacheKey, errorResult, 60 * 60);

      return errorResult;
    }
  }

  /**
   * Fallback parser for when JSON parsing fails
   * @param {string} text - Raw analysis text
   * @returns {Object} - Parsed analysis object
   */
  parseFallbackAnalysis(text) {
    const analysis = {
      sentiment: 'neutral',
      instructions: [],
      time_sensitive: false,
      conditions: [],
      priority: 'medium',
      concerns: []
    };

    // Simple keyword-based extraction
    const lowerText = text.toLowerCase();

    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('immediately')) {
      analysis.priority = 'urgent';
      analysis.time_sensitive = true;
    } else if (lowerText.includes('important') || lowerText.includes('please')) {
      analysis.priority = 'high';
    }

    if (lowerText.includes('leave at door') || lowerText.includes('no signature')) {
      analysis.conditions.push('leave at door');
    }

    if (lowerText.includes('signature required') || lowerText.includes('must sign')) {
      analysis.conditions.push('signature required');
    }

    if (lowerText.includes('problem') || lowerText.includes('issue') || lowerText.includes('concern')) {
      analysis.concerns.push('Customer mentioned issues');
    }

    return analysis;
  }

  /**
   * Process recording with full AI pipeline (transcription + analysis)
   * @param {string} recordingUrl - URL of the recording
   * @param {string} recordingId - Recording ID
   * @returns {Object} - Complete AI processing result
   */
  async processRecording(recordingUrl, recordingId) {
    logger.info(`Starting AI processing for recording ${recordingId}`);

    // Step 1: Transcribe
    const transcriptionResult = await this.transcribeRecording(recordingUrl, recordingId);

    if (!transcriptionResult.success) {
      return {
        success: false,
        recordingId,
        error: transcriptionResult.error,
        stage: 'transcription'
      };
    }

    // Step 2: Analyze
    const analysisResult = await this.analyzeTranscription(
      transcriptionResult.transcription,
      recordingId
    );

    return {
      success: true,
      recordingId,
      transcription: transcriptionResult,
      analysis: analysisResult,
      processedAt: new Date().toISOString()
    };
  }

  /**
   * Get AI service status
   * @returns {Object} - Service status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      provider: 'OpenAI',
      features: ['transcription', 'sentiment_analysis', 'keyword_extraction'],
      cacheEnabled: cacheService.isConnected
    };
  }
}

// Export singleton instance
const aiService = new AIService();

module.exports = aiService;