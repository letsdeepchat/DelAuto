# Monitoring and Analytics Documentation

This document covers the monitoring, logging, and analytics capabilities of the DelAuto system.

## Monitoring Architecture

### System Health Monitoring

#### Health Check Endpoints

**GET /health**
Returns overall system health status.

```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T12:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "database": {
      "status": "healthy",
      "responseTime": "45ms",
      "connections": {
        "active": 12,
        "available": 38,
        "totalCreated": 156
      }
    },
    "redis": {
      "status": "healthy",
      "responseTime": "2ms",
      "memory": {
        "used": "45MB",
        "available": "155MB"
      }
    },
    "twilio": {
      "status": "healthy",
      "responseTime": "150ms",
      "balance": "$125.50"
    },
    "external": {
      "status": "healthy",
      "openai": "healthy",
      "cloudflare": "healthy"
    }
  },
  "metrics": {
    "uptime": "99.9%",
    "responseTime": {
      "p50": "120ms",
      "p95": "450ms",
      "p99": "1200ms"
    },
    "errorRate": "0.05%",
    "throughput": "1250 req/min"
  }
}
```

**GET /health/detailed**
Provides detailed health information for debugging.

```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "healthy",
      "details": {
        "connectionCount": 12,
        "activeConnections": 8,
        "queryLatency": "45ms",
        "replicaLag": "0ms"
      }
    },
    "cache": {
      "status": "healthy",
      "details": {
        "hitRate": "94.5%",
        "memoryUsage": "45MB",
        "evictedKeys": 1250,
        "connectedClients": 15
      }
    },
    "queue": {
      "status": "healthy",
      "details": {
        "waitingJobs": 5,
        "activeJobs": 2,
        "completedJobs": 15420,
        "failedJobs": 45,
        "processingRate": "12 jobs/min"
      }
    }
  }
}
```

### Application Metrics

#### Request Metrics
```javascript
const requestMetrics = {
  totalRequests: 0,
  responseTime: {
    count: 0,
    sum: 0,
    avg: 0,
    p50: 0,
    p95: 0,
    p99: 0
  },
  statusCodes: {
    '2xx': 0,
    '4xx': 0,
    '5xx': 0
  },
  endpoints: new Map(),
  methods: new Map()
};
```

#### Business Metrics
```javascript
const businessMetrics = {
  deliveries: {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    completionRate: 0
  },
  calls: {
    total: 0,
    successful: 0,
    failed: 0,
    avgDuration: 0,
    successRate: 0
  },
  agents: {
    total: 0,
    active: 0,
    avgDeliveriesPerAgent: 0,
    avgResponseTime: 0
  },
  customers: {
    total: 0,
    active: 0,
    avgDeliveriesPerCustomer: 0,
    satisfactionScore: 0
  }
};
```

### Logging System

#### Winston Configuration
```javascript
const winston = require('winston');

// Core logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'delauto-api',
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV
  },
  transports: [
    // Console logging for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // File logging
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),

    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});
```

#### Structured Logging
```javascript
// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.id || generateRequestId();

  // Log incoming request
  logger.info('Request received', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
    query: req.query
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    logger.log(logLevel, 'Request completed', {
      requestId,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      user: req.agent?.id
    });
  });

  next();
};
```

#### Log Levels and Usage
```javascript
// Error: System errors, exceptions
logger.error('Database connection failed', {
  error: error.message,
  stack: error.stack,
  context: { userId, action: 'login' }
});

// Warn: Warning conditions, potential issues
logger.warn('Rate limit exceeded', {
  ip: req.ip,
  endpoint: req.path,
  limit: 100,
  window: '15min'
});

// Info: General information, successful operations
logger.info('Delivery completed', {
  deliveryId: '64f1a2b3c4d5e6f7g8h9i0j1',
  agentId: '64f1a2b3c4d5e6f7g8h9i0j2',
  duration: 1800000 // 30 minutes
});

// Debug: Detailed debugging information
logger.debug('Cache operation', {
  operation: 'get',
  key: 'user:64f1a2b3c4d5e6f7g8h9i0j2',
  hit: true,
  duration: '2ms'
});
```

### Analytics System

#### Real-time Analytics

**Dashboard Analytics**
```javascript
const analyticsService = {
  async getDashboardSummary() {
    const cacheKey = 'dashboard:summary';
    let summary = await cacheService.get(cacheKey);

    if (!summary) {
      summary = await this.calculateDashboardSummary();
      await cacheService.set(cacheKey, summary, 300); // 5 minutes
    }

    return summary;
  },

  async calculateDashboardSummary() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalDeliveries,
      completedDeliveries,
      totalCalls,
      successfulCalls,
      activeAgents
    ] = await Promise.all([
      Delivery.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Delivery.countDocuments({
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo }
      }),
      CallLog.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      CallLog.countDocuments({
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo }
      }),
      Agent.countDocuments({ is_active: true })
    ]);

    return {
      overview: {
        totalDeliveries,
        completedDeliveries,
        totalCalls,
        successfulCalls,
        activeAgents,
        completionRate: totalDeliveries > 0 ?
          (completedDeliveries / totalDeliveries * 100).toFixed(1) : 0,
        callSuccessRate: totalCalls > 0 ?
          (successfulCalls / totalCalls * 100).toFixed(1) : 0
      },
      trends: await this.getTrendsData(thirtyDaysAgo),
      performance: await this.getPerformanceMetrics(thirtyDaysAgo)
    };
  }
};
```

**Time Series Data**
```javascript
async getTimeSeriesData(metric, filters = {}) {
  const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = filters.endDate || new Date();

  const pipeline = [
    {
      $match: {
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt'
          }
        },
        count: { $sum: 1 },
        successful: {
          $sum: {
            $cond: [
              { $eq: ['$status', metric === 'deliveries' ? 'completed' : 'completed'] },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $sort: { '_id': 1 }
    },
    {
      $project: {
        date: '$_id',
        count: 1,
        successful: 1,
        failed: { $subtract: ['$count', '$successful'] },
        _id: 0
      }
    }
  ];

  const collection = metric === 'deliveries' ? Delivery : CallLog;
  return await collection.aggregate(pipeline);
}
```

#### Agent Performance Analytics
```javascript
async getAgentAnalytics(filters = {}) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const pipeline = [
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
        status: 'completed'
      }
    },
    {
      $lookup: {
        from: 'agents',
        localField: 'agent_id',
        foreignField: '_id',
        as: 'agent'
      }
    },
    {
      $unwind: '$agent'
    },
    {
      $group: {
        _id: '$agent_id',
        agentName: { $first: '$agent.name' },
        deliveriesCompleted: { $sum: 1 },
        totalDeliveryTime: { $sum: '$delivery_time' },
        successfulDeliveries: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        agentId: '$_id',
        agentName: 1,
        deliveriesCompleted: 1,
        averageDeliveryTime: {
          $cond: [
            { $gt: ['$deliveriesCompleted', 0] },
            { $divide: ['$totalDeliveryTime', '$deliveriesCompleted'] },
            0
          ]
        },
        successRate: {
          $multiply: [
            {
              $divide: ['$successfulDeliveries', '$deliveriesCompleted']
            },
            100
          ]
        },
        _id: 0
      }
    },
    {
      $sort: { successRate: -1, deliveriesCompleted: -1 }
    }
  ];

  return await Delivery.aggregate(pipeline);
}
```

### Alerting System

#### Alert Configuration
```javascript
const alertRules = {
  highErrorRate: {
    condition: (metrics) => metrics.errorRate > 5,
    severity: 'critical',
    message: 'Error rate exceeded 5%',
    channels: ['email', 'slack', 'sms']
  },

  lowDeliveryCompletion: {
    condition: (metrics) => metrics.completionRate < 80,
    severity: 'warning',
    message: 'Delivery completion rate below 80%',
    channels: ['email', 'dashboard']
  },

  databaseConnectionIssues: {
    condition: (health) => health.database.status !== 'healthy',
    severity: 'critical',
    message: 'Database connection issues detected',
    channels: ['email', 'sms', 'pagerduty']
  },

  queueBacklog: {
    condition: (queueStats) => queueStats.waiting > 100,
    severity: 'warning',
    message: 'Queue backlog exceeds 100 jobs',
    channels: ['slack', 'dashboard']
  }
};
```

#### Alert Channels
```javascript
const alertChannels = {
  email: async (alert) => {
    await emailService.send({
      to: process.env.ALERT_EMAIL_RECIPIENTS,
      subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,
      template: 'alert',
      data: alert
    });
  },

  slack: async (alert) => {
    await slackService.postMessage({
      channel: process.env.SLACK_ALERT_CHANNEL,
      text: `*${alert.severity.toUpperCase()}*: ${alert.message}`,
      attachments: [{
        color: alert.severity === 'critical' ? 'danger' : 'warning',
        fields: Object.entries(alert.details || {}).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true
        }))
      }]
    });
  },

  sms: async (alert) => {
    if (alert.severity === 'critical') {
      await twilioService.sendSMS({
        to: process.env.ALERT_SMS_RECIPIENTS,
        message: `[CRITICAL] ${alert.message}`
      });
    }
  }
};
```

### Performance Monitoring

#### APM Integration
```javascript
// Elastic APM configuration
const apm = require('elastic-apm-node').start({
  serviceName: 'delauto-api',
  secretToken: process.env.ELASTIC_APM_SECRET_TOKEN,
  serverUrl: process.env.ELASTIC_APM_SERVER_URL,
  environment: process.env.NODE_ENV,

  // Performance settings
  captureBody: 'errors',
  captureErrorLogStackTraces: 'always',
  captureHeaders: true,
  captureSpanStackTraces: false,

  // Disable for development
  active: process.env.NODE_ENV === 'production',

  // Custom metrics
  metricsInterval: 30000, // 30 seconds
  breakdownMetrics: true
});

// Custom spans for business logic
const span = apm.startSpan('calculate-delivery-route');
try {
  // Business logic
  const route = await calculateRoute(delivery);
  span.setLabel('route_length', route.distance);
} catch (error) {
  span.captureException(error);
} finally {
  span.end();
}
```

#### Custom Metrics Collection
```javascript
const metrics = {
  counters: new Map(),
  histograms: new Map(),
  gauges: new Map(),

  increment: (name, value = 1, tags = {}) => {
    const key = `${name}:${JSON.stringify(tags)}`;
    const current = metrics.counters.get(key) || 0;
    metrics.counters.set(key, current + value);
  },

  histogram: (name, value, tags = {}) => {
    const key = `${name}:${JSON.stringify(tags)}`;
    if (!metrics.histograms.has(key)) {
      metrics.histograms.set(key, []);
    }
    metrics.histograms.get(key).push(value);
  },

  gauge: (name, value, tags = {}) => {
    const key = `${name}:${JSON.stringify(tags)}`;
    metrics.gauges.set(key, value);
  }
};

// Usage
metrics.increment('api_requests_total', 1, { method: 'GET', endpoint: '/deliveries' });
metrics.histogram('api_request_duration', responseTime, { method: 'GET' });
metrics.gauge('active_connections', activeConnections);
```

### Dashboard Integration

#### Grafana Dashboards
```json
{
  "dashboard": {
    "title": "DelAuto System Overview",
    "tags": ["delauto", "production"],
    "timezone": "UTC",
    "panels": [
      {
        "title": "API Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "P95 Response Time"
          }
        ]
      },
      {
        "title": "Delivery Completion Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(rate(deliveries_completed_total[1h])) / sum(rate(deliveries_total[1h])) * 100",
            "legendFormat": "Completion Rate %"
          }
        ]
      },
      {
        "title": "System Health",
        "type": "table",
        "targets": [
          {
            "expr": "up{job='delauto-api'}",
            "legendFormat": "Service Status"
          }
        ]
      }
    ]
  }
}
```

### Log Aggregation

#### ELK Stack Integration
```javascript
// Filebeat configuration for log shipping
const filebeatConfig = {
  filebeat: {
    inputs: [
      {
        type: 'log',
        paths: ['/app/logs/*.log'],
        json: {
          keys_under_root: true,
          add_error_key: true
        },
        processors: [
          {
            add_fields: {
              fields: {
                service: 'delauto-api',
                environment: process.env.NODE_ENV
              }
            }
          }
        ]
      }
    ]
  },

  output: {
    elasticsearch: {
      hosts: [process.env.ELASTICSEARCH_HOST],
      index: 'delauto-%{+yyyy.MM.dd}'
    }
  }
};
```

#### Kibana Dashboards
```json
{
  "visualization": {
    "title": "Error Rate Over Time",
    "type": "line",
    "aggs": [
      {
        "id": "1",
        "type": "date_histogram",
        "schema": "segment",
        "params": {
          "field": "@timestamp",
          "interval": "1h"
        }
      },
      {
        "id": "2",
        "type": "avg",
        "schema": "metric",
        "params": {
          "field": "error_rate"
        }
      }
    ]
  }
}
```

### Incident Response

#### Automated Incident Detection
```javascript
const incidentDetector = {
  checkSystemHealth: async () => {
    const health = await healthService.checkAll();

    const issues = [];

    if (health.database.status !== 'healthy') {
      issues.push({
        type: 'database',
        severity: 'critical',
        message: 'Database connection issues'
      });
    }

    if (health.api.errorRate > 5) {
      issues.push({
        type: 'api',
        severity: 'warning',
        message: `High error rate: ${health.api.errorRate}%`
      });
    }

    if (issues.length > 0) {
      await incidentManager.createIncident({
        title: 'System Health Issues Detected',
        description: issues.map(i => i.message).join(', '),
        severity: issues.some(i => i.severity === 'critical') ? 'critical' : 'warning',
        issues
      });
    }
  },

  checkBusinessMetrics: async () => {
    const metrics = await analyticsService.getCurrentMetrics();

    if (metrics.deliveryCompletionRate < 80) {
      await incidentManager.createIncident({
        title: 'Low Delivery Completion Rate',
        description: `Completion rate dropped to ${metrics.deliveryCompletionRate}%`,
        severity: 'warning',
        metrics
      });
    }
  }
};
```

#### Incident Management
```javascript
const incidentManager = {
  async createIncident(incidentData) {
    const incident = await Incident.create({
      ...incidentData,
      status: 'open',
      createdAt: new Date(),
      alerts: []
    });

    // Send notifications
    await notificationService.sendIncidentAlert(incident);

    // Auto-escalate if critical
    if (incident.severity === 'critical') {
      setTimeout(() => {
        this.escalateIncident(incident._id);
      }, 15 * 60 * 1000); // 15 minutes
    }

    return incident;
  },

  async resolveIncident(incidentId, resolution) {
    await Incident.findByIdAndUpdate(incidentId, {
      status: 'resolved',
      resolvedAt: new Date(),
      resolution
    });

    await notificationService.sendResolutionAlert(incidentId);
  }
};
```

This comprehensive monitoring and analytics system ensures that DelAuto maintains high visibility into system performance, business metrics, and can quickly detect and respond to issues.