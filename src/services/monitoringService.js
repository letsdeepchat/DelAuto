const os = require('os');
const logger = require('../utils/logger');

class MonitoringService {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      endpointMetrics: new Map(),
      systemMetrics: {},
      businessMetrics: {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalRecordings: 0,
        activeAgents: 0,
        averageCallDuration: 0,
        averageDeliveryTime: 0,
      },
    };

    // Collect system metrics immediately and then every 30 seconds
    this.collectSystemMetrics();
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    logger.info('Monitoring service initialized');
  }

  /**
   * Record HTTP request metrics
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {number} statusCode - Response status code
   * @param {number} responseTime - Response time in milliseconds
   */
  recordRequest(method, path, statusCode, responseTime) {
    this.metrics.requestCount++;

    // Record response time
    this.metrics.responseTimes.push(responseTime);
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift(); // Keep only last 1000 measurements
    }

    // Record error count
    if (statusCode >= 400) {
      this.metrics.errorCount++;
    }

    // Record endpoint-specific metrics
    const endpointKey = `${method} ${path}`;
    if (!this.metrics.endpointMetrics.has(endpointKey)) {
      this.metrics.endpointMetrics.set(endpointKey, {
        count: 0,
        errors: 0,
        totalResponseTime: 0,
        averageResponseTime: 0,
        lastAccessed: Date.now(),
      });
    }

    const endpointData = this.metrics.endpointMetrics.get(endpointKey);
    endpointData.count++;
    endpointData.totalResponseTime += responseTime;
    endpointData.averageResponseTime =
      endpointData.totalResponseTime / endpointData.count;
    endpointData.lastAccessed = Date.now();

    if (statusCode >= 400) {
      endpointData.errors++;
    }
  }

  /**
   * Record business metrics
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @param {string} operation - 'increment' or 'set'
   */
  recordBusinessMetric(metric, value, operation = 'increment') {
    if (this.metrics.businessMetrics.hasOwnProperty(metric)) {
      if (operation === 'increment') {
        this.metrics.businessMetrics[metric] += value;
      } else if (operation === 'set') {
        this.metrics.businessMetrics[metric] = value;
      }
    }
  }

  /**
   * Collect system performance metrics
   */
  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    this.metrics.systemMetrics = {
      timestamp: Date.now(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
        userMS: Math.round(cpuUsage.user / 1000),
        systemMS: Math.round(cpuUsage.system / 1000),
      },
      uptime: {
        process: process.uptime(),
        system: os.uptime(),
      },
      loadAverage: os.loadavg(),
      platform: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
      },
    };
  }

  /**
   * Get current metrics summary
   * @returns {Object} - Metrics summary
   */
  getMetricsSummary() {
    const uptime = Date.now() - this.metrics.startTime;
    const avgResponseTime =
      this.metrics.responseTimes.length > 0
        ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) /
          this.metrics.responseTimes.length
        : 0;

    return {
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      requests: {
        total: this.metrics.requestCount,
        errors: this.metrics.errorCount,
        errorRate:
          this.metrics.requestCount > 0
            ? (this.metrics.errorCount / this.metrics.requestCount) * 100
            : 0,
        averageResponseTime: Math.round(avgResponseTime),
      },
      business: this.metrics.businessMetrics,
      system: this.metrics.systemMetrics,
      endpoints: Array.from(this.metrics.endpointMetrics.entries())
        .map(([endpoint, data]) => ({
          endpoint,
          ...data,
        }))
        .sort((a, b) => b.count - a.count), // Sort by request count descending
    };
  }

  /**
   * Get health check status
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    const summary = this.getMetricsSummary();
    const errorRate = summary.requests.errorRate;

    let status = 'healthy';
    const issues = [];

    // Check error rate (more than 5% errors is concerning)
    if (errorRate > 5) {
      status = 'degraded';
      issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
    }

    // Check memory usage (more than 80% heap used is concerning)
    const heapUsagePercent =
      (summary.system.memory.heapUsed / summary.system.memory.heapTotal) * 100;
    if (heapUsagePercent > 80) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push(`High memory usage: ${heapUsagePercent.toFixed(1)}%`);
    }

    // Check uptime (less than 1 hour might indicate frequent restarts)
    if (summary.uptime < 3600000) {
      // 1 hour
      status = status === 'healthy' ? 'warning' : status;
      issues.push('Service recently started');
    }

    return {
      status,
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0',
      issues,
      metrics: summary,
    };
  }

  /**
   * Format uptime duration to human readable string
   * @param {number} uptimeMs - Uptime in milliseconds
   * @returns {string} - Formatted uptime
   */
  formatUptime(uptimeMs) {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {return `${days}d ${hours % 24}h`;}
    if (hours > 0) {return `${hours}h ${minutes % 60}m`;}
    if (minutes > 0) {return `${minutes}m ${seconds % 60}s`;}
    return `${seconds}s`;
  }

  /**
   * Log metrics summary (for scheduled logging)
   */
  logMetricsSummary() {
    const summary = this.getMetricsSummary();
    logger.info('Metrics Summary', {
      uptime: summary.uptimeFormatted,
      requests: summary.requests,
      business: summary.business,
      memoryMB: summary.system.memory?.heapUsedMB || 0,
    });
  }

  /**
   * Reset metrics (useful for testing or manual reset)
   */
  resetMetrics() {
    this.metrics.requestCount = 0;
    this.metrics.errorCount = 0;
    this.metrics.responseTimes = [];
    this.metrics.endpointMetrics.clear();
    this.metrics.startTime = Date.now();
    logger.info('Metrics reset');
  }
}

// Export singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;
