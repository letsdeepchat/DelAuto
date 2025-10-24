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
    if (cached) {return cached;}

    try {
      const matchConditions = {};

      // Date range filter
      if (filters.startDate || filters.endDate) {
        matchConditions.scheduled_time = {};
        if (filters.startDate)
        {matchConditions.scheduled_time.$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions.scheduled_time.$lte = new Date(filters.endDate);}
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
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
            },
            failedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            pendingDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
            },
            inTransitDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] },
            },
            avgDeliveryTime: { $avg: '$actual_delivery_time' },
            totalValue: { $sum: '$total_value' },
          },
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
                {
                  $divide: [
                    '$completedDeliveries',
                    { $max: ['$totalDeliveries', 1] },
                  ],
                },
                100,
              ],
            },
            failureRate: {
              $multiply: [
                {
                  $divide: [
                    '$failedDeliveries',
                    { $max: ['$totalDeliveries', 1] },
                  ],
                },
                100,
              ],
            },
            avgDeliveryTime: { $round: ['$avgDeliveryTime', 2] },
            totalValue: { $round: ['$totalValue', 2] },
          },
        },
      ];

      const result = await mongoose.connection.db
        .collection('deliveries')
        .aggregate(pipeline)
        .toArray();
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
    if (cached) {return cached;}

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate)
        {matchConditions.created_at.$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions.created_at.$lte = new Date(filters.endDate);}
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            successfulCalls: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failedCalls: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['failed', 'no-answer', 'busy']] },
                  1,
                  0,
                ],
              },
            },
            avgCallDuration: { $avg: '$duration' },
            totalRecordingSize: { $sum: '$recording_size' },
          },
        },
        {
          $project: {
            totalCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successfulCalls', { $max: ['$totalCalls', 1] }] },
                100,
              ],
            },
            failureRate: {
              $multiply: [
                { $divide: ['$failedCalls', { $max: ['$totalCalls', 1] }] },
                100,
              ],
            },
            avgCallDuration: { $round: ['$avgCallDuration', 2] },
            totalRecordingSize: { $round: ['$totalRecordingSize', 2] },
          },
        },
      ];

      const result = await mongoose.connection.db
        .collection('call_logs')
        .aggregate(pipeline)
        .toArray();
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
    if (cached) {return cached;}

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate)
        {matchConditions.created_at.$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions.created_at.$lte = new Date(filters.endDate);}
      }

      const pipeline = [
        { $match: matchConditions },
        {
          $lookup: {
            from: 'agents',
            localField: 'agent_id',
            foreignField: '_id',
            as: 'agent',
          },
        },
        { $unwind: '$agent' },
        {
          $group: {
            _id: '$agent_id',
            agentName: { $first: '$agent.name' },
            totalDeliveries: { $sum: 1 },
            completedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
            },
            failedDeliveries: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            avgDeliveryTime: { $avg: '$actual_delivery_time' },
            totalEarnings: { $sum: '$delivery_fee' },
          },
        },
        {
          $project: {
            agentName: 1,
            totalDeliveries: 1,
            completedDeliveries: 1,
            failedDeliveries: 1,
            completionRate: {
              $multiply: [
                {
                  $divide: [
                    '$completedDeliveries',
                    { $max: ['$totalDeliveries', 1] },
                  ],
                },
                100,
              ],
            },
            avgDeliveryTime: { $round: ['$avgDeliveryTime', 2] },
            totalEarnings: { $round: ['$totalEarnings', 2] },
          },
        },
        { $sort: { totalDeliveries: -1 } },
      ];

      const analytics = await mongoose.connection.db
        .collection('deliveries')
        .aggregate(pipeline)
        .toArray();

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
    if (cached) {return cached;}

    try {
      let collection, groupField, dateField;

      switch (metric) {
      case 'deliveries':
        collection = 'deliveries';
        dateField = 'scheduled_time';
        groupField = {
          $dateToString: { format: '%Y-%m-%d', date: '$scheduled_time' },
        };
        break;
      case 'calls':
        collection = 'call_logs';
        dateField = 'created_at';
        groupField = {
          $dateToString: { format: '%Y-%m-%d', date: '$created_at' },
        };
        break;
      default:
        return [];
      }

      const matchConditions = {};
      if (filters.startDate || filters.endDate) {
        matchConditions[dateField] = {};
        if (filters.startDate)
        {matchConditions[dateField].$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions[dateField].$lte = new Date(filters.endDate);}
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
                  {
                    $in: [
                      '$status',
                      metric === 'deliveries' ? ['delivered'] : ['completed'],
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            date: 1,
            count: 1,
            successful: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successful', { $max: ['$count', 1] }] },
                100,
              ],
            },
          },
        },
        { $sort: { date: 1 } },
      ];

      const data = await mongoose.connection.db
        .collection(collection)
        .aggregate(pipeline)
        .toArray();

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
    if (cached) {return cached;}

    try {
      const [deliveryStats, callStats, agentStats] = await Promise.all([
        this.getDeliveryAnalytics(),
        this.getCallAnalytics(),
        this.getAgentAnalytics(),
      ]);

      // Get today's stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayFilters = {
        startDate: today.toISOString(),
        endDate: tomorrow.toISOString(),
      };
      const [todayDeliveries, todayCalls] = await Promise.all([
        this.getDeliveryAnalytics(todayFilters),
        this.getCallAnalytics(todayFilters),
      ]);

      const summary = {
        overview: {
          totalDeliveries: deliveryStats.totalDeliveries || 0,
          completionRate: deliveryStats.completionRate || 0,
          totalCalls: callStats.totalCalls || 0,
          callSuccessRate: callStats.successRate || 0,
          activeAgents: agentStats.length || 0,
        },
        today: {
          deliveries: todayDeliveries.totalDeliveries || 0,
          completedDeliveries: todayDeliveries.completedDeliveries || 0,
          calls: todayCalls.totalCalls || 0,
          successfulCalls: todayCalls.successfulCalls || 0,
        },
        performance: {
          avgDeliveryTime: deliveryStats.avgDeliveryTime || 0,
          avgCallDuration: callStats.avgCallDuration || 0,
          topPerformingAgent: agentStats[0] || null,
        },
        system: monitoringService.getHealthStatus(),
        generatedAt: new Date().toISOString(),
      };

      await cacheService.set(cacheKey, summary, 5 * 60); // Cache for 5 minutes

      return summary;
    } catch (error) {
      logger.error('Dashboard summary error:', error);
      return this.getEmptyDashboardSummary();
    }
  }

  /**
   * Get failed delivery reduction metrics
   * @param {Object} filters - Date range filters
   * @returns {Object} - Failed delivery metrics
   */
  async getFailedDeliveryReductionMetrics(filters = {}) {
    const cacheKey = `analytics:failed_delivery_reduction:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {return cached;}

    try {
      // Calculate baseline failure rate (previous period)
      const now = new Date();
      const currentPeriod = {
        startDate:
          filters.startDate ||
          new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: filters.endDate || now.toISOString(),
      };

      const previousPeriod = {
        startDate: new Date(
          new Date(currentPeriod.startDate).getTime() -
            30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        endDate: currentPeriod.startDate,
      };

      const [currentStats, previousStats] = await Promise.all([
        this.getDeliveryAnalytics(currentPeriod),
        this.getDeliveryAnalytics(previousPeriod),
      ]);

      // Get AI-powered delivery success metrics
      const aiImpactMetrics = await this.getAIPoweredDeliveryImpact();

      const metrics = {
        currentPeriod: {
          failureRate: currentStats.failureRate || 0,
          totalDeliveries: currentStats.totalDeliveries || 0,
          failedDeliveries: currentStats.failedDeliveries || 0,
        },
        previousPeriod: {
          failureRate: previousStats.failureRate || 0,
          totalDeliveries: previousStats.totalDeliveries || 0,
          failedDeliveries: previousStats.failedDeliveries || 0,
        },
        improvement: {
          failureRateReduction: Math.max(
            0,
            (previousStats.failureRate || 0) - (currentStats.failureRate || 0),
          ),
          absoluteReduction: Math.max(
            0,
            (previousStats.failedDeliveries || 0) -
              (currentStats.failedDeliveries || 0),
          ),
          percentageImprovement: previousStats.failureRate
            ? ((previousStats.failureRate - (currentStats.failureRate || 0)) /
                previousStats.failureRate) *
              100
            : 0,
        },
        aiPoweredImpact: aiImpactMetrics,
        target: {
          industryAverage: 8.5, // Industry average failure rate
          companyTarget: 5.0, // Company target
          achieved: (currentStats.failureRate || 0) <= 5.0,
        },
        generatedAt: new Date().toISOString(),
      };

      await cacheService.set(cacheKey, metrics, this.cacheTTL);
      return metrics;
    } catch (error) {
      logger.error('Failed delivery reduction metrics error:', error);
      return this.getEmptyFailedDeliveryMetrics();
    }
  }

  /**
   * Get customer response pattern analytics
   * @param {Object} filters - Date range filters
   * @returns {Object} - Customer response analytics
   */
  async getCustomerResponsePatterns(filters = {}) {
    const cacheKey = `analytics:customer_response:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {return cached;}

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate)
        {matchConditions.created_at.$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions.created_at.$lte = new Date(filters.endDate);}
      }

      // Analyze response patterns by time of day, day of week, etc.
      const pipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: {
              hour: { $hour: '$created_at' },
              dayOfWeek: { $dayOfWeek: '$created_at' },
              status: '$status',
            },
            count: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
            successfulResponses: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
          },
        },
        {
          $group: {
            _id: '$_id.hour',
            hour: { $first: '$_id.hour' },
            totalCalls: { $sum: '$count' },
            successfulCalls: { $sum: '$successfulResponses' },
            avgDuration: { $avg: '$avgDuration' },
            dayBreakdown: {
              $push: {
                dayOfWeek: '$_id.dayOfWeek',
                count: '$count',
                successRate: {
                  $multiply: [
                    {
                      $divide: [
                        '$successfulResponses',
                        { $max: ['$count', 1] },
                      ],
                    },
                    100,
                  ],
                },
              },
            },
          },
        },
        {
          $project: {
            hour: 1,
            totalCalls: 1,
            successfulCalls: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successfulCalls', { $max: ['$totalCalls', 1] }] },
                100,
              ],
            },
            avgDuration: { $round: ['$avgDuration', 2] },
            dayBreakdown: 1,
          },
        },
        { $sort: { hour: 1 } },
      ];

      const hourlyPatterns = await mongoose.connection.db
        .collection('call_logs')
        .aggregate(pipeline)
        .toArray();

      // Get response type analysis (voice instructions vs no answer, etc.)
      const responseTypePipeline = [
        { $match: matchConditions },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
            percentage: { $sum: 1 }, // Will be calculated in next stage
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$count' },
            breakdown: {
              $push: {
                status: '$_id',
                count: '$count',
                avgDuration: { $round: ['$avgDuration', 2] },
              },
            },
          },
        },
        {
          $project: {
            total: 1,
            breakdown: {
              $map: {
                input: '$breakdown',
                as: 'item',
                in: {
                  status: '$$item.status',
                  count: '$$item.count',
                  avgDuration: '$$item.avgDuration',
                  percentage: {
                    $multiply: [
                      { $divide: ['$$item.count', { $max: ['$total', 1] }] },
                      100,
                    ],
                  },
                },
              },
            },
          },
        },
      ];

      const responseTypes = await mongoose.connection.db
        .collection('call_logs')
        .aggregate(responseTypePipeline)
        .toArray();

      const patterns = {
        hourlyPatterns: hourlyPatterns || [],
        responseTypes: responseTypes[0] || { total: 0, breakdown: [] },
        insights: {
          bestCallHour: this.findBestCallHour(hourlyPatterns),
          responseRate: this.calculateOverallResponseRate(hourlyPatterns),
          peakDays: this.findPeakDays(hourlyPatterns),
        },
        recommendations: this.generateResponseRecommendations(
          hourlyPatterns,
          responseTypes[0],
        ),
        generatedAt: new Date().toISOString(),
      };

      await cacheService.set(cacheKey, patterns, this.cacheTTL);
      return patterns;
    } catch (error) {
      logger.error('Customer response patterns error:', error);
      return this.getEmptyResponsePatterns();
    }
  }

  /**
   * Get agent listening compliance metrics
   * @param {Object} filters - Date range filters
   * @returns {Object} - Agent compliance analytics
   */
  async getAgentListeningCompliance(filters = {}) {
    const cacheKey = `analytics:agent_compliance:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {return cached;}

    try {
      const matchConditions = {};

      if (filters.startDate || filters.endDate) {
        matchConditions.created_at = {};
        if (filters.startDate)
        {matchConditions.created_at.$gte = new Date(filters.startDate);}
        if (filters.endDate)
        {matchConditions.created_at.$lte = new Date(filters.endDate);}
      }

      // Analyze agent listening behavior
      const pipeline = [
        { $match: matchConditions },
        {
          $lookup: {
            from: 'deliveries',
            localField: 'delivery_id',
            foreignField: '_id',
            as: 'delivery',
          },
        },
        { $unwind: { path: '$delivery', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'agents',
            localField: 'agent_id',
            foreignField: '_id',
            as: 'agent',
          },
        },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$agent_id',
            agentName: { $first: '$agent.name' },
            totalDeliveries: { $sum: 1 },
            recordingsListened: {
              $sum: {
                $cond: [{ $eq: ['$listened_status', 'listened'] }, 1, 0],
              },
            },
            recordingsSkipped: {
              $sum: { $cond: [{ $eq: ['$listened_status', 'skipped'] }, 1, 0] },
            },
            avgListeningTime: { $avg: '$listening_duration' },
            successfulDeliveries: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$listened_status', 'listened'] },
                      { $eq: ['$delivery.status', 'delivered'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            agentName: 1,
            totalDeliveries: 1,
            recordingsListened: 1,
            recordingsSkipped: 1,
            complianceRate: {
              $multiply: [
                {
                  $divide: [
                    '$recordingsListened',
                    { $max: ['$totalDeliveries', 1] },
                  ],
                },
                100,
              ],
            },
            avgListeningTime: { $round: ['$avgListeningTime', 2] },
            successRateAfterListening: {
              $multiply: [
                {
                  $divide: [
                    '$successfulDeliveries',
                    { $max: ['$recordingsListened', 1] },
                  ],
                },
                100,
              ],
            },
          },
        },
        { $sort: { complianceRate: -1 } },
      ];

      const complianceData = await mongoose.connection.db
        .collection('recording_listens')
        .aggregate(pipeline)
        .toArray();

      // Overall compliance stats
      const overallStats =
        complianceData.length > 0
          ? {
            totalAgents: complianceData.length,
            avgComplianceRate:
                complianceData.reduce(
                  (sum, agent) => sum + agent.complianceRate,
                  0,
                ) / complianceData.length,
            topPerformer: complianceData[0],
            needsImprovement: complianceData.filter(
              (agent) => agent.complianceRate < 80,
            ),
          }
          : {
            totalAgents: 0,
            avgComplianceRate: 0,
            topPerformer: null,
            needsImprovement: [],
          };

      const compliance = {
        agentBreakdown: complianceData,
        overallStats,
        benchmarks: {
          targetCompliance: 95, // Target 95% compliance
          industryAverage: 85,
          achieved: overallStats.avgComplianceRate >= 95,
        },
        impact: {
          successImprovement: this.calculateComplianceImpact(complianceData),
        },
        generatedAt: new Date().toISOString(),
      };

      await cacheService.set(cacheKey, compliance, this.cacheTTL);
      return compliance;
    } catch (error) {
      logger.error('Agent compliance analytics error:', error);
      return this.getEmptyComplianceMetrics();
    }
  }

  /**
   * Calculate ROI from prevented failed deliveries
   * @param {Object} filters - Date range filters
   * @returns {Object} - ROI calculations
   */
  async getROIFromDeliveryAutomation(filters = {}) {
    const cacheKey = `analytics:roi:${JSON.stringify(filters)}`;

    const cached = await cacheService.get(cacheKey);
    if (cached) {return cached;}

    try {
      // Get failed delivery reduction metrics
      const reductionMetrics =
        await this.getFailedDeliveryReductionMetrics(filters);

      // Cost assumptions (customizable)
      const costs = {
        failedDeliveryCost: 25, // Cost of a failed delivery (redelivery, customer service, etc.)
        aiProcessingCost: 0.1, // Cost per AI analysis
        callCost: 0.014, // Cost per minute of calling
        avgCallDuration: 1.5, // Average call duration in minutes
        monthlyVolume: 10000, // Monthly delivery volume
      };

      // Calculate savings
      const preventedFailures = reductionMetrics.improvement.absoluteReduction;
      const failureCostSavings = preventedFailures * costs.failedDeliveryCost;

      // Calculate costs
      const aiProcessingCosts = costs.monthlyVolume * costs.aiProcessingCost;
      const callCosts =
        costs.monthlyVolume * costs.callCost * costs.avgCallDuration;

      // Calculate ROI
      const totalCosts = aiProcessingCosts + callCosts;
      const netSavings = failureCostSavings - totalCosts;
      const roi = totalCosts > 0 ? (netSavings / totalCosts) * 100 : 0;

      // Calculate payback period
      const monthlySavings = netSavings / 12; // Assuming annual calculation
      const paybackMonths = totalCosts > 0 ? totalCosts / monthlySavings : 0;

      const roiAnalysis = {
        savings: {
          preventedFailedDeliveries: preventedFailures,
          failureCostSavings,
          totalSavings: failureCostSavings,
        },
        costs: {
          aiProcessingCosts,
          callCosts,
          totalCosts,
        },
        roi: {
          netSavings,
          roiPercentage: Math.round(roi * 100) / 100,
          paybackPeriodMonths: Math.round(paybackMonths * 100) / 100,
          breakEvenAchieved: netSavings > 0,
        },
        assumptions: costs,
        period: filters,
        projections: {
          annualSavings: netSavings * 12,
          threeYearSavings: netSavings * 36,
        },
        generatedAt: new Date().toISOString(),
      };

      await cacheService.set(cacheKey, roiAnalysis, this.cacheTTL);
      return roiAnalysis;
    } catch (error) {
      logger.error('ROI calculation error:', error);
      return this.getEmptyROIAnalysis();
    }
  }

  /**
   * Get AI-powered delivery impact metrics
   * @returns {Object} - AI impact metrics
   */
  async getAIPoweredDeliveryImpact() {
    try {
      // This would analyze deliveries where AI insights were used
      // For now, return placeholder data
      return {
        aiProcessedDeliveries: 0,
        successRateWithAI: 0,
        avgProcessingTime: 0,
        costPerAIProcessing: 0.1,
      };
    } catch (error) {
      logger.error('AI impact metrics error:', error);
      return {
        aiProcessedDeliveries: 0,
        successRateWithAI: 0,
        avgProcessingTime: 0,
        costPerAIProcessing: 0.1,
      };
    }
  }

  // Helper methods for the new analytics features

  findBestCallHour(hourlyPatterns) {
    if (!hourlyPatterns || hourlyPatterns.length === 0) {return null;}
    return hourlyPatterns.reduce((best, current) =>
      current.successRate > best.successRate ? current : best,
    );
  }

  calculateOverallResponseRate(hourlyPatterns) {
    if (!hourlyPatterns || hourlyPatterns.length === 0) {return 0;}
    const totalCalls = hourlyPatterns.reduce(
      (sum, hour) => sum + hour.totalCalls,
      0,
    );
    const successfulCalls = hourlyPatterns.reduce(
      (sum, hour) => sum + hour.successfulCalls,
      0,
    );
    return totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
  }

  findPeakDays(hourlyPatterns) {
    // Simplified implementation
    return ['Monday', 'Tuesday', 'Wednesday']; // Would be calculated from data
  }

  generateResponseRecommendations(hourlyPatterns, responseTypes) {
    const recommendations = [];

    if (hourlyPatterns && hourlyPatterns.length > 0) {
      const bestHour = this.findBestCallHour(hourlyPatterns);
      if (bestHour) {
        recommendations.push(
          `Schedule more calls during ${bestHour.hour}:00 for higher response rates`,
        );
      }
    }

    if (responseTypes && responseTypes.breakdown) {
      const noAnswerRate =
        responseTypes.breakdown.find((r) => r.status === 'no-answer')
          ?.percentage || 0;
      if (noAnswerRate > 30) {
        recommendations.push(
          'High no-answer rate detected. Consider implementing call-back scheduling.',
        );
      }
    }

    return recommendations;
  }

  calculateComplianceImpact(complianceData) {
    // Calculate how compliance affects delivery success
    const highCompliance = complianceData.filter(
      (agent) => agent.complianceRate >= 90,
    );
    const lowCompliance = complianceData.filter(
      (agent) => agent.complianceRate < 90,
    );

    const highSuccess =
      highCompliance.length > 0
        ? highCompliance.reduce(
          (sum, agent) => sum + agent.successRateAfterListening,
          0,
        ) / highCompliance.length
        : 0;

    const lowSuccess =
      lowCompliance.length > 0
        ? lowCompliance.reduce(
          (sum, agent) => sum + agent.successRateAfterListening,
          0,
        ) / lowCompliance.length
        : 0;

    return {
      highComplianceSuccessRate: highSuccess,
      lowComplianceSuccessRate: lowSuccess,
      improvement: highSuccess - lowSuccess,
    };
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
      totalValue: 0,
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
      totalRecordingSize: 0,
    };
  }

  getEmptyDashboardSummary() {
    return {
      overview: {
        totalDeliveries: 0,
        completionRate: 0,
        totalCalls: 0,
        callSuccessRate: 0,
        activeAgents: 0,
      },
      today: {
        deliveries: 0,
        completedDeliveries: 0,
        calls: 0,
        successfulCalls: 0,
      },
      performance: {
        avgDeliveryTime: 0,
        avgCallDuration: 0,
        topPerformingAgent: null,
      },
      system: monitoringService.getHealthStatus(),
      generatedAt: new Date().toISOString(),
    };
  }

  getEmptyFailedDeliveryMetrics() {
    return {
      currentPeriod: {
        failureRate: 0,
        totalDeliveries: 0,
        failedDeliveries: 0,
      },
      previousPeriod: {
        failureRate: 0,
        totalDeliveries: 0,
        failedDeliveries: 0,
      },
      improvement: {
        failureRateReduction: 0,
        absoluteReduction: 0,
        percentageImprovement: 0,
      },
      aiPoweredImpact: {
        aiProcessedDeliveries: 0,
        successRateWithAI: 0,
        avgProcessingTime: 0,
        costPerAIProcessing: 0.1,
      },
      target: {
        industryAverage: 8.5,
        companyTarget: 5.0,
        achieved: false,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  getEmptyResponsePatterns() {
    return {
      hourlyPatterns: [],
      responseTypes: { total: 0, breakdown: [] },
      insights: {
        bestCallHour: null,
        responseRate: 0,
        peakDays: [],
      },
      recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  getEmptyComplianceMetrics() {
    return {
      agentBreakdown: [],
      overallStats: {
        totalAgents: 0,
        avgComplianceRate: 0,
        topPerformer: null,
        needsImprovement: [],
      },
      benchmarks: {
        targetCompliance: 95,
        industryAverage: 85,
        achieved: false,
      },
      impact: {
        successImprovement: {
          highComplianceSuccessRate: 0,
          lowComplianceSuccessRate: 0,
          improvement: 0,
        },
      },
      generatedAt: new Date().toISOString(),
    };
  }

  getEmptyROIAnalysis() {
    return {
      savings: {
        preventedFailedDeliveries: 0,
        failureCostSavings: 0,
        totalSavings: 0,
      },
      costs: {
        aiProcessingCosts: 0,
        callCosts: 0,
        totalCosts: 0,
      },
      roi: {
        netSavings: 0,
        roiPercentage: 0,
        paybackPeriodMonths: 0,
        breakEvenAchieved: false,
      },
      assumptions: {
        failedDeliveryCost: 25,
        aiProcessingCost: 0.1,
        callCost: 0.014,
        avgCallDuration: 1.5,
        monthlyVolume: 10000,
      },
      period: {},
      projections: {
        annualSavings: 0,
        threeYearSavings: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

// Export singleton instance
const analyticsService = new AnalyticsService();

module.exports = analyticsService;
