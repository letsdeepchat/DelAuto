const mongoose = require('mongoose');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');
const monitoringService = require('./monitoringService');

class AnalyticsService {
  constructor() {
    this.cacheTTL = 15 * 60; // 15 minutes cache
  }

  /**
   * Get delivery performance analytics
   * @param {Object} filters - Date range, agent, status filters
   * @returns {Object} - Analytics data
   */
  async getDeliveryAnalytics(filters = {}) {
    const cacheKey = `analytics:deliveries:${JSON.stringify(filters)}`;

    // Check cache
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const matchConditions = {};

      // Date range filter
      if (filters.startDate || filters.endDate) {
        matchConditions.scheduled_time = {};
        if (filters.startDate) matchConditions.scheduled_time.$gte = new Date(filters.startDate);
        if (filters.endDate) matchConditions.scheduled_time.$lte = new Date(filters.endDate);
      }

      // Agent filter
      if (filters.agentId) {
        matchConditions.agent_id = mongoose.Types.ObjectId(filters.agentId);
      }

      // Status filter
      if (filters.status) {
        matchConditions.status = filters.status;
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalDeliveries: { $sum: 1 },
            completedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            failedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            },
            pendingDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            inTransitDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] }
            },
            avgDeliveryTime: { $avg: '$actual_delivery_time' },
            totalValue: { $sum: '$total_value' }
          }
        },
        {
          $project: {
            totalDeliveries: 1,
            completedDeliveries: 1,
            failedDeliveries: 1,
            pendingDeliveries: 1,
            inTransitDeliveries: 1,
            completionRate: {
              $multiply: [
                { $divide: ['$completedDeliveries', { $max: ['$totalDeliveries', 1] }] },
                100
              ]
            },
            failureRate: {
              $multiply: [
                { $divide: ['$failedDeliveries', { $max: ['$totalDeliveries', 1] }] },
                100
              ]
            },
            avgDeliveryTime: { $round: ['$avgDeliveryTime', 2] },
            totalValue: { $round: ['$totalValue', 2] }
          }
        }
      ];

      const result = await mongoose.connection.db.collection('deliveries').aggregate(pipeline).toArray();
      const analytics = result[0] || this.getEmptyDeliveryAnalytics();

      // Cache result
      await cacheService.set(cacheKey, analytics, this.cacheTTL);

      return analytics;

    } catch (error) {
      logger.error('Delivery analytics error:', error);
      return this.getEmptyDeliveryAnalytics();
    }
  }

  /**
   * Get call performance analytics
   * @param {Object} filters - Date range filters
   * @returns {Object} - Call analytics data
   */
  async getCallAnalytics(filters = {}) {
    const cacheKey = `analytics:calls:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate) matchConditions.created_at.$gte = new Date(filters.startDate);
        if (filters.endDate) matchConditions.created_at.$lte = new Date(filters.endDate);
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            successfulCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            failedCalls: {
              $sum: { $cond: [{ $in: ['$status', ['failed', 'no-answer', 'busy']] }, 1, 0] }
            },
            avgCallDuration: { $avg: '$duration' },
            totalRecordingSize: { $sum: '$recording_size' }
          }
        },
        {
          $project: {
            totalCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successfulCalls', { $max: ['$totalCalls', 1] }] },
                100
              ]
            },
            failureRate: {
              $multiply: [
                { $divide: ['$failedCalls', { $max: ['$totalCalls', 1] }] },
                100
              ]
            },
            avgCallDuration: { $round: ['$avgCallDuration', 2] },
            totalRecordingSize: { $round: ['$totalRecordingSize', 2] }
          }
        }
      ];

      const result = await mongoose.connection.db.collection('call_logs').aggregate(pipeline).toArray();
      const analytics = result[0] || this.getEmptyCallAnalytics();

      await cacheService.set(cacheKey, analytics, this.cacheTTL);

      return analytics;

    } catch (error) {
      logger.error('Call analytics error:', error);
      return this.getEmptyCallAnalytics();
    }
  }

  /**
   * Get agent performance analytics
   * @param {Object} filters - Date range filters
   * @returns {Array} - Agent performance data
   */
  async getAgentAnalytics(filters = {}) {
    const cacheKey = `analytics:agents:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate) matchConditions.created_at.$gte = new Date(filters.startDate);
        if (filters.endDate) matchConditions.created_at.$lte = new Date(filters.endDate);
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $lookup: {
            from: 'agents',
            localField: 'agent_id',
            foreignField: '_id',
            as: 'agent'
          }
        },
        { $unwind: '$agent' },
        {
          $group: {
            _id: '$agent_id',
            agentName: { $first: '$agent.name' },
            totalDeliveries: { $sum: 1 },
            completedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            failedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            },
            avgDeliveryTime: { $avg: '$actual_delivery_time' },
            totalEarnings: { $sum: '$delivery_fee' }
          }
        },
        {
          $project: {
            agentName: 1,
            totalDeliveries: 1,
            completedDeliveries: 1,
            failedDeliveries: 1,
            completionRate: {
              $multiply: [
                { $divide: ['$completedDeliveries', { $max: ['$totalDeliveries', 1] }] },
                100
              ]
            },
            avgDeliveryTime: { $round: ['$avgDeliveryTime', 2] },
            totalEarnings: { $round: ['$totalEarnings', 2] }
          }
        },
        { $sort: { totalDeliveries: -1 } }
      ];

      const analytics = await mongoose.connection.db.collection('deliveries').aggregate(pipeline).toArray();

      await cacheService.set(cacheKey, analytics, this.cacheTTL);

      return analytics;

    } catch (error) {
      logger.error('Agent analytics error:', error);
      return [];
    }
  }

  /**
   * Get time-series data for charts
   * @param {string} metric - Metric to get time series for
   * @param {Object} filters - Date range and grouping filters
   * @returns {Array} - Time series data
   */
  async getTimeSeriesData(metric, filters = {}) {
    const cacheKey = `analytics:timeseries:${metric}:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      let collection, groupField, dateField;

      switch (metric) {
        case 'deliveries':
          collection = 'deliveries';
          dateField = 'scheduled_time';
          groupField = { $dateToString: { format: '%Y-%m-%d', date: '$scheduled_time' } };
          break;
        case 'calls':
          collection = 'call_logs';
          dateField = 'created_at';
          groupField = { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } };
          break;
        default:
          return [];
      }

      const matchConditions = {};
      if (filters.startDate || filters.endDate) {
        matchConditions[dateField] = {};
        if (filters.startDate) matchConditions[dateField].$gte = new Date(filters.startDate);
        if (filters.endDate) matchConditions[dateField].$lte = new Date(filters.endDate);
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: groupField,
            date: { $first: groupField },
            count: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [
                  { $in: ['$status', metric === 'deliveries' ? ['delivered'] : ['completed']] },
                  1, 0
                ]
              }
            }
          }
        },
        {
          $project: {
            date: 1,
            count: 1,
            successful: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successful', { $max: ['$count', 1] }] },
                100
              ]
            }
          }
        },
        { $sort: { date: 1 } }
      ];

      const data = await mongoose.connection.db.collection(collection).aggregate(pipeline).toArray();

      await cacheService.set(cacheKey, data, this.cacheTTL);

      return data;

    } catch (error) {
      logger.error('Time series analytics error:', error);
      return [];
    }
  }

  /**
   * Get dashboard summary with key metrics
   * @returns {Object} - Dashboard summary
   */
  async getDashboardSummary() {
    const cacheKey = 'analytics:dashboard';

    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    try {
      const [deliveryStats, callStats, agentStats] = await Promise.all([
        this.getDeliveryAnalytics(),
        this.getCallAnalytics(),
        this.getAgentAnalytics()
      ]);

      // Get today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayFilters = { startDate: today.toISOString(), endDate: tomorrow.toISOString() };
      const [todayDeliveries, todayCalls] = await Promise.all([
        this.getDeliveryAnalytics(todayFilters),
        this.getCallAnalytics(todayFilters)
      ]);

      const summary = {
        overview: {
          totalDeliveries: deliveryStats.totalDeliveries || 0,
          completionRate: deliveryStats.completionRate || 0,
          totalCalls: callStats.totalCalls || 0,
          callSuccessRate: callStats.successRate || 0,
          activeAgents: agentStats.length || 0
        },
        today: {
          deliveries: todayDeliveries.totalDeliveries || 0,
          completedDeliveries: todayDeliveries.completedDeliveries || 0,
          calls: todayCalls.totalCalls || 0,
          successfulCalls: todayCalls.successfulCalls || 0
        },
        performance: {
          avgDeliveryTime: deliveryStats.avgDeliveryTime || 0,
          avgCallDuration: callStats.avgCallDuration || 0,
          topPerformingAgent: agentStats[0] || null
        },
        system: monitoringService.getHealthStatus(),
        generatedAt: new Date().toISOString()
      };

      await cacheService.set(cacheKey, summary, 5 * 60); // Cache for 5 minutes

      return summary;

    } catch (error) {
      logger.error('Dashboard summary error:', error);
      return this.getEmptyDashboardSummary();
    }
  }

  /**
   * Clear analytics cache
   */
  async clearCache() {
    const keys = await cacheService.keys('analytics:*');
    for (const key of keys) {
      await cacheService.del(key);
    }
    logger.info('Analytics cache cleared');
  }

  // Helper methods for empty states
  getEmptyDeliveryAnalytics() {
    return {
      totalDeliveries: 0,
      completedDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: 0,
      inTransitDeliveries: 0,
      completionRate: 0,
      failureRate: 0,
      avgDeliveryTime: 0,
      totalValue: 0
    };
  }

  getEmptyCallAnalytics() {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      successRate: 0,
      failureRate: 0,
      avgCallDuration: 0,
      totalRecordingSize: 0
    };
  }

  getEmptyDashboardSummary() {
    return {
      overview: {
        totalDeliveries: 0,
        completionRate: 0,
        totalCalls: 0,
        callSuccessRate: 0,
        activeAgents: 0
      },
      today: {
        deliveries: 0,
        completedDeliveries: 0,
        calls: 0,
        successfulCalls: 0
      },
      performance: {
        avgDeliveryTime: 0,
        avgCallDuration: 0,
        topPerformingAgent: null
      },
      system: monitoringService.getHealthStatus(),
      generatedAt: new Date().toISOString()
    };
  }
}

// Export singleton instance
const analyticsService = new AnalyticsService();

module.exports = analyticsService;