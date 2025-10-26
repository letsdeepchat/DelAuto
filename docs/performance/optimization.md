# Performance Optimization Guide

This guide covers performance optimization techniques and best practices for the DelAuto system.

## Performance Architecture

### Caching Strategy

#### Multi-Level Caching

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │     Redis       │    │   Database      │
│     Cache       │◄──►│     Cache       │◄──►│                 │
│                 │    │                 │    │                 │
│ - API Responses │    │ - Query Results │    │ - Raw Data      │
│ - Computed Data │    │ - Session Data  │    │                 │
│ - Static Assets │    │ - User Tokens   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### Redis Cache Implementation
```javascript
const cacheService = {
  // Cache with TTL
  async set(key, value, ttl = 3600) {
    const serialized = JSON.stringify(value);
    await redis.setex(key, ttl, serialized);
  },

  // Get with fallback
  async get(key, fallback = null) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : fallback;
    } catch (error) {
      logger.error('Cache get error:', error);
      return fallback;
    }
  },

  // Cache with conditional fetch
  async getOrSet(key, fetcher, ttl = 3600) {
    let data = await this.get(key);
    if (data === null) {
      data = await fetcher();
      await this.set(key, data, ttl);
    }
    return data;
  }
};
```

#### Cache Key Strategy
```javascript
const cacheKeys = {
  // User-specific data
  user: (userId) => `user:${userId}`,
  userDeliveries: (userId) => `user:${userId}:deliveries`,

  // Analytics data
  analytics: (type, filters) => `analytics:${type}:${hash(filters)}`,
  dashboard: (userId) => `dashboard:${userId}`,

  // API responses
  apiResponse: (method, path, params) => `api:${method}:${path}:${hash(params)}`,

  // External data
  twilioStatus: (callSid) => `twilio:status:${callSid}`,
  weather: (location) => `weather:${location}`,
};
```

### Database Optimization

#### Indexing Strategy

**Single Field Indexes:**
```javascript
// High-cardinality fields
Delivery.schema.index({ customer_id: 1 });
Delivery.schema.index({ agent_id: 1 });
Delivery.schema.index({ status: 1 });

// Time-based queries
Delivery.schema.index({ scheduled_time: 1 });
Delivery.schema.index({ createdAt: -1 });
CallLog.schema.index({ createdAt: -1 });
```

**Compound Indexes:**
```javascript
// Common query patterns
Delivery.schema.index({ status: 1, scheduled_time: 1 });
Delivery.schema.index({ agent_id: 1, status: 1 });
Delivery.schema.index({ customer_id: 1, createdAt: -1 });

// Analytics queries
CallLog.schema.index({ status: 1, createdAt: 1 });
CallLog.schema.index({ delivery_id: 1, createdAt: -1 });
```

**Partial Indexes:**
```javascript
// Index only active deliveries
Delivery.schema.index(
  { scheduled_time: 1 },
  {
    partialFilterExpression: {
      status: { $in: ['scheduled', 'assigned', 'in_transit'] }
    }
  }
);
```

#### Query Optimization

**Efficient Queries:**
```javascript
// Use projection to limit fields
const deliveries = await Delivery.find(query)
  .select('customer_id address status scheduled_time')
  .lean(); // Return plain objects

// Use cursor for large datasets
const cursor = Delivery.find(query).cursor();
for await (const delivery of cursor) {
  // Process in batches
}

// Aggregate for analytics
const stats = await Delivery.aggregate([
  { $match: { status: 'completed' } },
  {
    $group: {
      _id: '$agent_id',
      count: { $sum: 1 },
      avgTime: { $avg: '$delivery_time' }
    }
  }
]);
```

**Avoid N+1 Queries:**
```javascript
// Bad: N+1 queries
const deliveries = await Delivery.find();
for (const delivery of deliveries) {
  delivery.customer = await Customer.findById(delivery.customer_id);
}

// Good: Single query with population
const deliveries = await Delivery.find()
  .populate('customer_id', 'name phone')
  .populate('agent_id', 'name phone');
```

#### Connection Pooling
```javascript
// Optimized MongoDB connection
mongoose.connect(uri, {
  maxPoolSize: 50,        // Maximum connections
  minPoolSize: 10,        // Minimum connections
  maxIdleTimeMS: 30000,   // Close connections after 30s of inactivity
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,  // Disable mongoose buffering
  bufferMaxEntries: 0,    // Disable mongoose buffering
  retryWrites: true,
  retryReads: true
});
```

### API Performance

#### Response Compression
```javascript
const compression = require('compression');

app.use(compression({
  level: 6,        // Compression level (1-9)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress images, videos, etc.
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));
```

#### Request Optimization
```javascript
// Parse JSON efficiently
app.use(express.json({
  limit: '10mb',
  strict: true,
  verify: (req, res, buf) => {
    // Verify JSON syntax
    try {
      JSON.parse(buf);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
}));

// Use raw body for webhooks
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
```

#### Pagination
```javascript
const paginate = async (model, query, options = {}) => {
  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 10;
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    model.find(query).skip(skip).limit(limit).lean(),
    model.countDocuments(query)
  ]);

  return {
    docs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
};
```

### Queue Optimization

#### Bull Queue Configuration
```javascript
const callQueue = new Bull('customer-calls', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50,    // Keep last 50 completed jobs
    removeOnFail: 100,       // Keep last 100 failed jobs
    attempts: 3,             // Retry failed jobs
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Process jobs concurrently
callQueue.process('initiate-call', 5, async (job) => {
  const { deliveryId } = job.data;
  await twilioService.makeCustomerCall(deliveryId);
});

// Monitor queue health
callQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

callQueue.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed:`, err);
});
```

#### Queue Monitoring
```javascript
const getQueueStats = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    callQueue.getWaiting(),
    callQueue.getActive(),
    callQueue.getCompleted(),
    callQueue.getFailed(),
    callQueue.getDelayed()
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length
  };
};
```

### Memory Optimization

#### Garbage Collection Tuning
```javascript
// Node.js GC tuning
node --max-old-space-size=4096 \
     --optimize-for-size \
     --max-new-space-size=1024 \
     --gc-interval=100 \
     app.js
```

#### Memory Leak Prevention
```javascript
// Monitor memory usage
const memUsage = process.memoryUsage();
if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
  logger.warn('High memory usage detected', memUsage);
}

// Clean up event listeners
const cleanup = () => {
  // Remove all listeners
  process.removeAllListeners();
  // Close database connections
  mongoose.connection.close();
  // Close Redis connections
  redis.disconnect();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
```

### Network Optimization

#### HTTP/2 Support
```javascript
const http2 = require('http2');
const fs = require('fs');

const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt')
}, app);

// Enable HTTP/2 server push for critical resources
server.on('stream', (stream, headers) => {
  if (headers[':path'] === '/dashboard') {
    stream.pushStream({ ':path': '/css/dashboard.css' }, (err, pushStream) => {
      pushStream.respondWithFile('public/css/dashboard.css');
    });
  }
});
```

#### CDN Integration
```javascript
// Serve static files from CDN
app.use('/static', express.static('public', {
  maxAge: '1y',
  setHeaders: (res, path) => {
    // Add CDN headers
    res.setHeader('CDN-Cache-Control', 'max-age=31536000');
    res.setHeader('Link', '</css/app.css>; rel=preload; as=style');
  }
}));
```

### Monitoring & Profiling

#### Performance Monitoring
```javascript
const responseTime = require('response-time');

// Add response time header
app.use(responseTime((req, res, time) => {
  if (time > 1000) { // Log slow requests
    logger.warn('Slow request', {
      method: req.method,
      url: req.url,
      time: `${time}ms`,
      userAgent: req.get('User-Agent')
    });
  }
}));
```

#### APM Integration
```javascript
// Application Performance Monitoring
const apm = require('elastic-apm-node').start({
  serviceName: 'delauto-api',
  secretToken: process.env.ELASTIC_APM_SECRET_TOKEN,
  serverUrl: process.env.ELASTIC_APM_SERVER_URL,
  environment: process.env.NODE_ENV
});

// Custom metrics
apm.addFilter((payload) => {
  // Filter sensitive data
  if (payload.context && payload.context.request) {
    delete payload.context.request.headers.authorization;
  }
  return payload;
});
```

### Load Testing

#### Artillery Configuration
```yaml
config:
  target: 'https://api.delauto.com'
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 120
      arrivalRate: 50
      name: Load test
    - duration: 60
      arrivalRate: 100
      name: Stress test

scenarios:
  - name: 'API load test'
    weight: 60
    flow:
      - get:
          url: '/api/deliveries'
          headers:
            x-api-key: '{{ apiKey }}'

  - name: 'Authentication test'
    weight: 20
    flow:
      - post:
          url: '/api/auth/login'
          json:
            email: 'loadtest@example.com'
            password: 'password123'
      - get:
          url: '/api/analytics/dashboard'
          headers:
            authorization: 'Bearer {{ token }}'

  - name: 'Analytics test'
    weight: 20
    flow:
      - get:
          url: '/api/analytics/overview'
          headers:
            authorization: 'Bearer {{ adminToken }}'
```

#### Load Test Execution
```bash
# Run load test
artillery run load-test.yml

# Generate report
artillery report report.json

# Run with custom environment
artillery run --environment production load-test.yml
```

### Scaling Strategies

#### Horizontal Scaling
```javascript
// Cluster mode for multi-core utilization
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart worker
  });
} else {
  app.listen(port);
}
```

#### Database Sharding
```javascript
// MongoDB sharding configuration
const shardingConfig = {
  // Shard deliveries by region
  deliveries: {
    key: { region: 1 },
    unique: false
  },

  // Shard users by user_id hash
  users: {
    key: { _id: 'hashed' },
    unique: false
  }
};
```

### Performance Benchmarks

#### Target Metrics
- **API Response Time**: P95 < 500ms
- **Database Query Time**: P95 < 100ms
- **Cache Hit Rate**: > 90%
- **Error Rate**: < 0.1%
- **Throughput**: 1000+ requests/second

#### Monitoring Queries
```javascript
// Slow query monitoring
db.setProfilingLevel(2, { slowms: 100 });

// Check slow queries
db.system.profile.find().sort({ millis: -1 }).limit(10);

// Index usage statistics
db.deliveries.aggregate([
  { $indexStats: {} }
]);
```

### Optimization Checklist

#### Code Level
- [ ] Use async/await consistently
- [ ] Implement proper error handling
- [ ] Use streaming for large data
- [ ] Implement connection pooling
- [ ] Cache frequently accessed data
- [ ] Use pagination for large datasets
- [ ] Optimize database queries
- [ ] Implement proper indexing

#### Infrastructure Level
- [ ] Use CDN for static assets
- [ ] Implement load balancing
- [ ] Configure auto-scaling
- [ ] Use connection pooling
- [ ] Implement caching layers
- [ ] Monitor resource usage
- [ ] Set up performance alerts

#### Database Level
- [ ] Analyze query performance
- [ ] Optimize indexes
- [ ] Use read replicas
- [ ] Implement sharding if needed
- [ ] Monitor connection pools
- [ ] Set up query monitoring

#### Application Level
- [ ] Implement response compression
- [ ] Use HTTP/2 when possible
- [ ] Optimize bundle size
- [ ] Implement lazy loading
- [ ] Cache API responses
- [ ] Use service workers
- [ ] Optimize images and assets

### Performance Testing

#### Automated Performance Tests
```javascript
describe('Performance Tests', () => {
  test('API response time under load', async () => {
    const startTime = Date.now();

    // Make multiple concurrent requests
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        request(app).get('/api/deliveries')
      );
    }

    const responses = await Promise.all(promises);
    const endTime = Date.now();

    const avgResponseTime = (endTime - startTime) / 100;
    expect(avgResponseTime).toBeLessThan(500); // 500ms target
  });

  test('Database query performance', async () => {
    const startTime = Date.now();

    await Delivery.find({ status: 'completed' }).limit(1000);
    const queryTime = Date.now() - startTime;

    expect(queryTime).toBeLessThan(100); // 100ms target
  });

  test('Cache hit rate', async () => {
    // Test cache effectiveness
    const cacheHits = await cacheService.getStats();
    const hitRate = cacheHits.hits / (cacheHits.hits + cacheHits.misses);

    expect(hitRate).toBeGreaterThan(0.9); // 90% target
  });
});
```

This comprehensive performance optimization guide provides the strategies and techniques needed to ensure DelAuto maintains high performance under various load conditions while scaling efficiently as the system grows.