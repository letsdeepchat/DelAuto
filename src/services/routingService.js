const mongoose = require('mongoose');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');
const analyticsService = require('./analyticsService');

class RoutingService {
  constructor() {
    this.cacheTTL = 30 * 60; // 30 minutes cache
  }

  /**
   * Smart agent assignment based on instruction complexity
   * @param {Object} delivery - Delivery object with instructions
   * @param {Array} availableAgents - List of available agents
   * @returns {Object} - Best agent assignment with reasoning
   */
  async assignAgentSmart(delivery, availableAgents) {
    if (!availableAgents || availableAgents.length === 0) {
      return { success: false, error: 'No available agents' };
    }

    if (availableAgents.length === 1) {
      return {
        success: true,
        agent: availableAgents[0],
        reasoning: 'Only one agent available'
      };
    }

    try {
      const cacheKey = `agent_assignment:${delivery._id}`;

      // Check cache
      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      // Analyze instruction complexity
      const complexity = await this.analyzeInstructionComplexity(delivery);

      // Get agent performance data
      const agentPerformance = await this.getAgentPerformanceData(availableAgents);

      // Calculate agent scores
      const agentScores = await this.calculateAgentScores(availableAgents, complexity, agentPerformance, delivery);

      // Sort agents by score (highest first)
      agentScores.sort((a, b) => b.score - a.score);

      const bestAgent = agentScores[0];

      const result = {
        success: true,
        agent: bestAgent.agent,
        score: bestAgent.score,
        reasoning: bestAgent.reasoning,
        alternatives: agentScores.slice(1, 3), // Top 3 alternatives
        complexity,
        generatedAt: new Date().toISOString()
      };

      // Cache result
      await cacheService.set(cacheKey, result, this.cacheTTL);

      logger.info(`Smart agent assignment for delivery ${delivery._id}: ${bestAgent.agent.name} (score: ${bestAgent.score})`);
      return result;

    } catch (error) {
      logger.error('Smart agent assignment error:', error);

      // Fallback to random assignment
      const randomAgent = availableAgents[Math.floor(Math.random() * availableAgents.length)];
      return {
        success: true,
        agent: randomAgent,
        score: 0,
        reasoning: 'Fallback random assignment due to error',
        alternatives: [],
        fallback: true
      };
    }
  }

  /**
   * Calculate optimal call timing based on geolocation and customer preferences
   * @param {Object} delivery - Delivery object
   * @param {Object} customer - Customer object
   * @returns {Object} - Optimal call timing recommendations
   */
  async calculateOptimalCallTiming(delivery, customer) {
    try {
      const cacheKey = `call_timing:${delivery._id}`;

      const cached = await cacheService.get(cacheKey);
      if (cached) return cached;

      // Get customer timezone and preferences
      const customerTimezone = customer.timezone || 'America/New_York';
      const customerPreferences = await this.getCustomerCallPreferences(customer._id);

      // Analyze historical response patterns
      const responsePatterns = await analyticsService.getCustomerResponsePatterns();

      // Calculate geolocation-based optimal times
      const geolocationOptimal = await this.calculateGeolocationOptimalTime(delivery, customerTimezone);

      // Combine with customer preferences and patterns
      const optimalTimes = this.combineTimingFactors(
        geolocationOptimal,
        customerPreferences,
        responsePatterns,
        customerTimezone
      );

      const result = {
        success: true,
        optimalTimes,
        customerTimezone,
        preferences: customerPreferences,
        reasoning: this.generateTimingReasoning(optimalTimes, customerPreferences),
        alternatives: this.generateAlternativeTimes(optimalTimes),
        generatedAt: new Date().toISOString()
      };

      await cacheService.set(cacheKey, result, this.cacheTTL);
      return result;

    } catch (error) {
      logger.error('Call timing calculation error:', error);
      return this.getDefaultCallTiming(delivery, customer);
    }
  }

  /**
   * Learn and update customer call preferences
   * @param {string} customerId - Customer ID
   * @param {Object} callResult - Call result data
   * @returns {Object} - Updated preferences
   */
  async learnCustomerPreferences(customerId, callResult) {
    try {
      const cacheKey = `customer_prefs:${customerId}`;

      // Get existing preferences
      let preferences = await cacheService.get(cacheKey) || {
        preferredHours: [],
        preferredDays: [],
        responseHistory: [],
        lastUpdated: new Date().toISOString()
      };

      // Add this call result to history
      preferences.responseHistory.push({
        timestamp: new Date().toISOString(),
        status: callResult.status,
        duration: callResult.duration,
        hour: new Date().getHours(),
        dayOfWeek: new Date().getDay()
      });

      // Keep only last 50 responses
      if (preferences.responseHistory.length > 50) {
        preferences.responseHistory = preferences.responseHistory.slice(-50);
      }

      // Recalculate preferences based on history
      preferences = this.calculatePreferencesFromHistory(preferences);

      preferences.lastUpdated = new Date().toISOString();

      // Cache updated preferences
      await cacheService.set(cacheKey, preferences, 24 * 60 * 60); // 24 hours

      return {
        success: true,
        preferences,
        historySize: preferences.responseHistory.length
      };

    } catch (error) {
      logger.error('Customer preference learning error:', error);
      return { success: false, error: error.message };
    }
  }

  // Helper methods for agent assignment

  async analyzeInstructionComplexity(delivery) {
    const instructions = delivery.instructions || '';
    const transcription = delivery.transcription || '';

    // Simple complexity analysis based on keywords and length
    const complexityIndicators = {
      urgent: /\b(urgent|asap|immediately|rush)\b/i.test(instructions + transcription),
      complex: /\b(special|careful|fragile|signature|specific)\b/i.test(instructions + transcription),
      length: (instructions + transcription).length,
      keywords: this.extractKeywords(instructions + transcription)
    };

    let complexityScore = 1; // Base complexity

    if (complexityIndicators.urgent) complexityScore += 2;
    if (complexityIndicators.complex) complexityScore += 1;
    if (complexityIndicators.length > 200) complexityScore += 1;
    if (complexityIndicators.keywords.length > 5) complexityScore += 1;

    return {
      score: Math.min(complexityScore, 5), // Max score of 5
      indicators: complexityIndicators,
      level: this.getComplexityLevel(complexityScore)
    };
  }

  extractKeywords(text) {
    const keywords = [];
    const patterns = [
      /\b(leave at door|signature required|fragile|urgent|special instructions)\b/gi,
      /\b(front desk|neighbor|security|gate code|buzz|intercom)\b/gi,
      /\b(morning|afternoon|evening|weekend|weekday)\b/gi
    ];

    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) keywords.push(...matches);
    });

    return [...new Set(keywords)]; // Remove duplicates
  }

  getComplexityLevel(score) {
    if (score <= 1) return 'simple';
    if (score <= 3) return 'medium';
    return 'complex';
  }

  async getAgentPerformanceData(agents) {
    const agentIds = agents.map(agent => agent._id);

    try {
      // Get performance metrics for the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const pipeline = [
        {
          $match: {
            agent_id: { $in: agentIds },
            created_at: { $gte: thirtyDaysAgo }
          }
        },
        {
          $lookup: {
            from: 'deliveries',
            localField: 'delivery_id',
            foreignField: '_id',
            as: 'delivery'
          }
        },
        { $unwind: { path: '$delivery', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$agent_id',
            totalDeliveries: { $sum: 1 },
            successfulDeliveries: {
              $sum: { $cond: [{ $eq: ['$delivery.status', 'delivered'] }, 1, 0] }
            },
            avgProcessingTime: { $avg: '$listening_duration' },
            urgentDeliveries: {
              $sum: { $cond: [{ $eq: ['$delivery.priority', 'urgent'] }, 1, 0] }
            },
            urgentSuccess: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$delivery.priority', 'urgent'] },
                      { $eq: ['$delivery.status', 'delivered'] }
                    ]
                  },
                  1, 0
                ]
              }
            }
          }
        },
        {
          $project: {
            successRate: {
              $multiply: [
                { $divide: ['$successfulDeliveries', { $max: ['$totalDeliveries', 1] }] },
                100
              ]
            },
            urgentSuccessRate: {
              $multiply: [
                { $divide: ['$urgentSuccess', { $max: ['$urgentDeliveries', 1] }] },
                100
              ]
            },
            avgProcessingTime: { $round: ['$avgProcessingTime', 2] },
            experience: '$totalDeliveries'
          }
        }
      ];

      const performanceData = await mongoose.connection.db.collection('recording_listens').aggregate(pipeline).toArray();

      // Convert to agent ID keyed object
      const performance = {};
      performanceData.forEach(data => {
        performance[data._id.toString()] = data;
      });

      return performance;

    } catch (error) {
      logger.error('Agent performance data error:', error);
      return {};
    }
  }

  async calculateAgentScores(agents, complexity, agentPerformance, delivery) {
    const scores = [];

    for (const agent of agents) {
      const performance = agentPerformance[agent._id.toString()] || {};
      let score = 50; // Base score
      const factors = [];

      // Factor 1: Success rate (30% weight)
      const successRate = performance.successRate || 0;
      score += (successRate / 100) * 30;
      factors.push(`Success Rate: ${successRate.toFixed(1)}%`);

      // Factor 2: Experience with complexity (25% weight)
      if (complexity.level === 'complex' && performance.urgentSuccessRate) {
        score += (performance.urgentSuccessRate / 100) * 25;
        factors.push(`Urgent Handling: ${performance.urgentSuccessRate.toFixed(1)}%`);
      } else if (complexity.level === 'simple') {
        // Prefer less experienced agents for simple tasks to balance workload
        score += Math.min(performance.experience || 0, 100) * 0.1;
        factors.push(`Workload Balance: ${Math.min(performance.experience || 0, 100)}`);
      } else {
        score += (performance.successRate / 100) * 25;
        factors.push(`General Performance: ${successRate.toFixed(1)}%`);
      }

      // Factor 3: Current workload (20% weight) - prefer agents with fewer recent deliveries
      const workloadPenalty = Math.min((performance.experience || 0) / 10, 20);
      score -= workloadPenalty;
      factors.push(`Workload: -${workloadPenalty.toFixed(1)}`);

      // Factor 4: Processing speed (15% weight) - faster for urgent deliveries
      if (delivery.priority === 'urgent' && performance.avgProcessingTime) {
        const speedBonus = Math.max(0, 120 - performance.avgProcessingTime) / 120 * 15;
        score += speedBonus;
        factors.push(`Speed: +${speedBonus.toFixed(1)}`);
      }

      // Factor 5: Agent availability/specialization (10% weight)
      // Add agent-specific bonuses here if needed

      const reasoning = `Score: ${score.toFixed(1)} | Factors: ${factors.join(', ')}`;

      scores.push({
        agent,
        score: Math.round(score * 10) / 10,
        reasoning,
        factors
      });
    }

    return scores;
  }

  // Helper methods for call timing

  async getCustomerCallPreferences(customerId) {
    const cacheKey = `customer_prefs:${customerId}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) return cached;

    // Default preferences if no history
    return {
      preferredHours: [9, 10, 11, 14, 15, 16, 17], // 9 AM - 6 PM
      preferredDays: [1, 2, 3, 4, 5], // Monday - Friday
      responseHistory: [],
      lastUpdated: new Date().toISOString()
    };
  }

  async calculateGeolocationOptimalTime(delivery, timezone) {
    // This would use actual geolocation data
    // For now, return reasonable defaults based on timezone

    const timezoneOffsets = {
      'America/New_York': -5,
      'America/Chicago': -6,
      'America/Denver': -7,
      'America/Los_Angeles': -8,
      'Europe/London': 0,
      'Europe/Paris': 1,
      'Asia/Tokyo': 9
    };

    const offset = timezoneOffsets[timezone] || 0;
    const utcOptimalStart = (9 - offset + 24) % 24; // Convert 9 AM local to UTC
    const utcOptimalEnd = (18 - offset + 24) % 24;   // Convert 6 PM local to UTC

    return {
      localTimezone: timezone,
      utcOffset: offset,
      optimalHours: {
        start: utcOptimalStart,
        end: utcOptimalEnd
      },
      businessHours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18], // 9 AM - 6 PM local
      reasoning: `Based on ${timezone} timezone (${offset >= 0 ? '+' : ''}${offset} UTC)`
    };
  }

  combineTimingFactors(geolocation, preferences, patterns, timezone) {
    const optimalTimes = [];

    // Find intersection of geolocation, preferences, and patterns
    const bestHours = this.findBestHours(geolocation, preferences, patterns);

    // Convert to specific time slots
    const now = new Date();
    for (let i = 0; i < 7; i++) { // Next 7 days
      const date = new Date(now);
      date.setDate(date.getDate() + i);

      bestHours.forEach(hour => {
        const timeSlot = new Date(date);
        timeSlot.setHours(hour, 0, 0, 0);

        if (timeSlot > now) { // Only future times
          optimalTimes.push({
            datetime: timeSlot.toISOString(),
            localHour: hour,
            dayOfWeek: timeSlot.getDay(),
            score: this.calculateTimeSlotScore(timeSlot, preferences, patterns),
            reasoning: this.getTimeSlotReasoning(hour, timeSlot.getDay(), preferences)
          });
        }
      });
    }

    // Sort by score and return top recommendations
    return optimalTimes
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  findBestHours(geolocation, preferences, patterns) {
    const candidates = new Set();

    // Add preferred hours
    preferences.preferredHours.forEach(hour => candidates.add(hour));

    // Add business hours
    geolocation.businessHours.forEach(hour => candidates.add(hour));

    // Add best hours from patterns
    if (patterns.insights && patterns.insights.bestCallHour) {
      candidates.add(patterns.insights.bestCallHour.hour);
    }

    return Array.from(candidates).sort((a, b) => a - b);
  }

  calculateTimeSlotScore(timeSlot, preferences, patterns) {
    let score = 50; // Base score

    const hour = timeSlot.getHours();
    const dayOfWeek = timeSlot.getDay();

    // Preference match (30 points)
    if (preferences.preferredHours.includes(hour)) score += 30;
    if (preferences.preferredDays.includes(dayOfWeek)) score += 20;

    // Pattern-based scoring (20 points)
    if (patterns.hourlyPatterns) {
      const hourPattern = patterns.hourlyPatterns.find(h => h.hour === hour);
      if (hourPattern) {
        score += (hourPattern.successRate / 100) * 20;
      }
    }

    // Day of week preference (10 points)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) score += 10; // Weekday bonus

    // Time of day optimization (20 points)
    if (hour >= 9 && hour <= 11) score += 15; // Morning preference
    else if (hour >= 14 && hour <= 17) score += 10; // Afternoon preference

    return Math.round(score);
  }

  getTimeSlotReasoning(hour, dayOfWeek, preferences) {
    const reasons = [];

    if (preferences.preferredHours.includes(hour)) {
      reasons.push('Customer preferred hour');
    }

    if (preferences.preferredDays.includes(dayOfWeek)) {
      reasons.push('Customer preferred day');
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    reasons.push(`${dayNames[dayOfWeek]} at ${hour}:00`);

    return reasons.join(', ');
  }

  generateTimingReasoning(optimalTimes, preferences) {
    if (optimalTimes.length === 0) return 'No optimal times found';

    const topTime = optimalTimes[0];
    return `Best time: ${new Date(topTime.datetime).toLocaleString()} (Score: ${topTime.score}). Based on customer preferences and historical patterns.`;
  }

  generateAlternativeTimes(optimalTimes) {
    // Generate fallback times if optimal times don't work
    const alternatives = [];

    // Add some buffer hours around optimal times
    optimalTimes.forEach(time => {
      const date = new Date(time.datetime);

      // -1 hour
      const earlier = new Date(date);
      earlier.setHours(earlier.getHours() - 1);
      alternatives.push({
        datetime: earlier.toISOString(),
        reasoning: '1 hour earlier as alternative'
      });

      // +1 hour
      const later = new Date(date);
      later.setHours(later.getHours() + 1);
      alternatives.push({
        datetime: later.toISOString(),
        reasoning: '1 hour later as alternative'
      });
    });

    return alternatives.slice(0, 6); // Limit to 6 alternatives
  }

  getDefaultCallTiming(delivery, customer) {
    // Fallback timing: next business hour
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);

    // Ensure it's during business hours (9 AM - 6 PM)
    if (nextHour.getHours() < 9) nextHour.setHours(9, 0, 0, 0);
    if (nextHour.getHours() > 18) {
      nextHour.setDate(nextHour.getDate() + 1);
      nextHour.setHours(9, 0, 0, 0);
    }

    return {
      success: true,
      optimalTimes: [{
        datetime: nextHour.toISOString(),
        localHour: nextHour.getHours(),
        dayOfWeek: nextHour.getDay(),
        score: 50,
        reasoning: 'Default business hours fallback'
      }],
      customerTimezone: customer.timezone || 'America/New_York',
      preferences: {},
      reasoning: 'Fallback timing due to calculation error',
      alternatives: [],
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  // Helper methods for preference learning

  calculatePreferencesFromHistory(preferences) {
    const history = preferences.responseHistory;

    if (history.length < 5) {
      // Not enough data, keep defaults
      return preferences;
    }

    // Analyze successful calls
    const successfulCalls = history.filter(call => call.status === 'completed');

    if (successfulCalls.length === 0) {
      return preferences;
    }

    // Calculate preferred hours based on successful calls
    const hourCounts = {};
    successfulCalls.forEach(call => {
      hourCounts[call.hour] = (hourCounts[call.hour] || 0) + 1;
    });

    const preferredHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([hour]) => parseInt(hour));

    // Calculate preferred days
    const dayCounts = {};
    successfulCalls.forEach(call => {
      dayCounts[call.dayOfWeek] = (dayCounts[call.dayOfWeek] || 0) + 1;
    });

    const preferredDays = Object.entries(dayCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([day]) => parseInt(day));

    preferences.preferredHours = preferredHours;
    preferences.preferredDays = preferredDays;

    return preferences;
  }

  /**
   * Get routing service status
   * @returns {Object} - Service status
   */
  getStatus() {
    return {
      name: 'Advanced Routing Service',
      features: [
        'smart_agent_assignment',
        'geolocation_call_timing',
        'customer_preference_learning'
      ],
      cacheEnabled: cacheService.isConnected,
      version: '1.0.0'
    };
  }
}

// Export singleton instance
const routingService = new RoutingService();

module.exports = routingService;