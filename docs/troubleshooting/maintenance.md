# System Maintenance Guide

This guide covers routine maintenance tasks and procedures for the DelAuto system.

## Daily Maintenance Tasks

### System Health Checks

#### Automated Health Monitoring
```bash
#!/bin/bash
# Daily health check script

# Check application health
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ "$HEALTH_STATUS" -ne 200 ]; then
    echo "Application health check failed: $HEALTH_STATUS"
    # Send alert
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"Application health check failed"}' \
        $SLACK_WEBHOOK_URL
fi

# Check database connectivity
DB_STATUS=$(mongosh --eval "db.runCommand({ping: 1})" --quiet)
if [ "$DB_STATUS" != "{ ok: 1 }" ]; then
    echo "Database health check failed"
    # Send alert
fi

# Check Redis connectivity
REDIS_STATUS=$(redis-cli ping)
if [ "$REDIS_STATUS" != "PONG" ]; then
    echo "Redis health check failed"
    # Send alert
fi

echo "Health checks completed at $(date)"
```

#### Manual Health Verification
```bash
# Check system resources
top -b -n 1 | head -20

# Check disk usage
df -h

# Check memory usage
free -h

# Check network connections
netstat -tlnp | grep :3000

# Check application logs
tail -f logs/combined.log | grep -i error
```

### Log Management

#### Log Rotation
```bash
# Configure logrotate for application logs
cat > /etc/logrotate.d/delauto << EOF
/app/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 delauto delauto
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# Manual log rotation
logrotate -f /etc/logrotate.d/delauto
```

#### Log Analysis
```bash
# Search for errors in logs
grep -i "error\|exception" logs/combined.log | tail -20

# Count HTTP status codes
awk '{print $9}' logs/access.log | sort | uniq -c | sort -nr

# Find slow requests
awk '$NF > 1000 {print $0}' logs/access.log

# Monitor error rates
ERROR_COUNT=$(grep -c " 5[0-9][0-9] " logs/access.log)
TOTAL_COUNT=$(wc -l < logs/access.log)
ERROR_RATE=$((ERROR_COUNT * 100 / TOTAL_COUNT))
echo "Error rate: $ERROR_RATE%"
```

## Weekly Maintenance Tasks

### Database Maintenance

#### Index Optimization
```javascript
// Check index usage
db.deliveries.aggregate([
  { $indexStats: {} }
]).forEach(function(stats) {
  print("Index:", stats.name);
  print("Usage count:", stats.accesses.ops);
  print("Since:", stats.accesses.since);
});

// Remove unused indexes
db.deliveries.dropIndex("old_index_name");

// Rebuild indexes if needed
db.deliveries.reIndex();
```

#### Database Cleanup
```javascript
// Remove old call logs (older than 1 year)
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

db.call_logs.deleteMany({
  createdAt: { $lt: oneYearAgo },
  status: { $in: ['completed', 'failed'] }
});

// Archive old deliveries
db.deliveries.updateMany(
  {
    createdAt: { $lt: oneYearAgo },
    status: 'completed'
  },
  {
    $set: { archived: true }
  }
);
```

#### Database Backup Verification
```bash
# Test backup restoration
BACKUP_FILE="/backups/delauto_$(date +%Y%m%d).tar.gz"

# Extract backup
mkdir -p /tmp/backup_test
tar -xzf $BACKUP_FILE -C /tmp/backup_test

# Restore to test database
mongorestore --db delauto_test /tmp/backup_test/mongodb

# Verify data integrity
mongosh delauto_test --eval "db.deliveries.countDocuments()"

# Clean up
rm -rf /tmp/backup_test
mongosh --eval "db.getSiblingDB('delauto_test').dropDatabase()"
```

### Cache Maintenance

#### Redis Maintenance
```bash
# Check memory usage
redis-cli info memory

# Check key count
redis-cli dbsize

# Find large keys
redis-cli --scan | head -10 | xargs redis-cli debug object | grep serializedlength

# Clear expired keys
redis-cli keys "*" | xargs redis-cli expireat

# Defragmentation (Redis 5.0+)
redis-cli memory purge
```

#### Application Cache Cleanup
```javascript
// Clear application cache
const cacheService = require('./services/cacheService');

async function cleanupCache() {
  // Remove old analytics data
  const keys = await cacheService.scanKeys('analytics:*');
  for (const key of keys) {
    const ttl = await cacheService.getTTL(key);
    if (ttl === -1) { // No expiration set
      await cacheService.del(key);
    }
  }

  // Clear old session data
  const sessionKeys = await cacheService.scanKeys('sess:*');
  for (const key of sessionKeys) {
    const data = await cacheService.get(key);
    if (data && data.lastActivity) {
      const lastActivity = new Date(data.lastActivity);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (lastActivity < thirtyDaysAgo) {
        await cacheService.del(key);
      }
    }
  }
}

cleanupCache();
```

### Queue Maintenance

#### Queue Health Check
```javascript
const Queue = require('bull');

// Check queue status
async function checkQueueHealth(queueName) {
  const queue = new Queue(queueName);

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(),
    queue.getFailed(),
    queue.getDelayed()
  ]);

  console.log(`${queueName} Queue Status:`);
  console.log(`Waiting: ${waiting.length}`);
  console.log(`Active: ${active.length}`);
  console.log(`Completed: ${completed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Delayed: ${delayed.length}`);

  // Clean up old completed jobs
  await queue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
  await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days

  await queue.close();
}

// Check all queues
checkQueueHealth('customer-calls');
checkQueueHealth('notifications');
```

#### Failed Job Cleanup
```javascript
// Retry or remove failed jobs
async function cleanupFailedJobs(queueName) {
  const queue = new Queue(queueName);

  const failedJobs = await queue.getFailed();

  for (const job of failedJobs) {
    const jobData = job.data;

    // Check if job is retryable
    if (jobData.retryCount < 3 && isRetryableError(job.failedReason)) {
      await job.retry();
    } else {
      // Move to dead letter queue or remove
      await job.remove();
      logger.warn(`Removed failed job ${job.id} from ${queueName}`, {
        jobData,
        failedReason: job.failedReason
      });
    }
  }

  await queue.close();
}

function isRetryableError(error) {
  const retryableErrors = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNRESET'
  ];

  return retryableErrors.some(code => error.includes(code));
}
```

## Monthly Maintenance Tasks

### Security Updates

#### System Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
npm audit fix

# Update Docker images
docker-compose pull

# Restart services
docker-compose up -d

# Check for security vulnerabilities
npm audit
trivy image your-registry/delauto-api:latest
```

#### Security Scanning
```bash
# Run security scans
# OWASP ZAP
zap.sh -cmd -quickurl https://your-domain.com -quickout security-scan.html

# Dependency vulnerability scan
npm audit --audit-level moderate

# Container vulnerability scan
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasecurity/trivy image --format json your-registry/delauto-api:latest
```

### Performance Optimization

#### Database Performance Tuning
```javascript
// Analyze slow queries
db.setProfilingLevel(2, { slowms: 100 });

// Check query performance
db.system.profile.find(
  { millis: { $gt: 100 } }
).sort({ millis: -1 }).limit(10);

// Optimize queries
db.deliveries.createIndex({
  status: 1,
  scheduled_time: 1,
  agent_id: 1
}, {
  background: true
});

// Update statistics
db.runCommand({ reIndex: 'deliveries' });
```

#### Application Performance Tuning
```javascript
// Profile application performance
const profiler = require('v8-profiler-node8');

// Start profiling
profiler.startProfiling('app-profile', true);

// Run performance tests
// ... your test code ...

// Stop profiling
const profile = profiler.stopProfiling('app-profile');
profile.export((error, result) => {
  fs.writeFileSync('profile.cpuprofile', result);
  profile.delete();
});
```

### Data Archiving

#### Archive Old Data
```javascript
// Archive completed deliveries older than 6 months
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

const oldDeliveries = await Delivery.find({
  status: 'completed',
  createdAt: { $lt: sixMonthsAgo }
});

// Move to archive collection
await ArchiveDelivery.insertMany(oldDeliveries);

// Remove from main collection
await Delivery.deleteMany({
  status: 'completed',
  createdAt: { $lt: sixMonthsAgo }
});
```

#### Compliance Data Retention
```javascript
// GDPR data retention (3 years for delivery data)
const threeYearsAgo = new Date();
threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

// Remove old data permanently
await Delivery.deleteMany({
  createdAt: { $lt: threeYearsAgo },
  archived: true
});

// Anonymize customer data for old deliveries
await Customer.updateMany(
  {
    'deliveries.createdAt': { $lt: threeYearsAgo }
  },
  {
    $unset: {
      phone: 1,
      email: 1,
      address: 1
    },
    $set: {
      gdprAnonymized: true,
      anonymizedAt: new Date()
    }
  }
);
```

## Quarterly Maintenance Tasks

### System Audits

#### Security Audit
```bash
# Check file permissions
find /app -type f -perm /111 -exec ls -l {} \;

# Check for world-writable files
find /app -type f -perm -002 -exec ls -l {} \;

# Audit user accounts
cat /etc/passwd | grep -E ':/bin/bash$|/bin/sh$'

# Check running processes
ps aux | grep -E '(node|mongo|redis)'

# Review firewall rules
sudo ufw status
sudo iptables -L
```

#### Performance Audit
```javascript
// Comprehensive performance check
const performanceAudit = {
  async runAudit() {
    const results = {
      database: await this.checkDatabasePerformance(),
      cache: await this.checkCachePerformance(),
      api: await this.checkAPIPerformance(),
      system: await this.checkSystemResources()
    };

    // Generate report
    this.generateReport(results);
  },

  async checkDatabasePerformance() {
    // Check query performance
    const slowQueries = await db.system.profile.find({
      millis: { $gt: 1000 }
    }).limit(10);

    // Check index usage
    const indexStats = await db.deliveries.aggregate([
      { $indexStats: {} }
    ]);

    return { slowQueries, indexStats };
  },

  async checkCachePerformance() {
    const info = await redis.info();
    return {
      hitRate: info.keyspace_hits / (info.keyspace_hits + info.keyspace_misses),
      memoryUsage: info.used_memory_human,
      connectedClients: info.connected_clients
    };
  }
};
```

### Backup Strategy Review

#### Backup Effectiveness Testing
```bash
# Full disaster recovery test
#!/bin/bash

# Simulate disaster
docker-compose down
sudo rm -rf /data/mongodb/*
sudo rm -rf /data/redis/*

# Restore from backup
BACKUP_FILE=$(ls -t /backups/delauto_*.tar.gz | head -1)
tar -xzf $BACKUP_FILE -C /tmp/restore

# Restore databases
mongorestore /tmp/restore/mongodb
redis-cli < /tmp/restore/redis/dump.rdb

# Start services
docker-compose up -d

# Verify restoration
curl http://localhost:3000/health
mongosh --eval "db.deliveries.countDocuments()"

# Clean up
rm -rf /tmp/restore
```

#### Backup Strategy Optimization
```javascript
// Implement incremental backups
const backupStrategy = {
  full: {
    frequency: 'weekly',
    retention: 52, // 52 weeks = 1 year
    compression: 'gzip',
    encryption: true
  },
  incremental: {
    frequency: 'daily',
    retention: 30, // 30 days
    compression: 'gzip',
    encryption: true
  },
  logs: {
    frequency: 'hourly',
    retention: 7, // 7 days
    compression: 'gzip',
    encryption: false
  }
};
```

## Emergency Maintenance

### System Recovery Procedures

#### Application Crash Recovery
```bash
# Check application status
pm2 status

# View crash logs
pm2 logs delauto-api --lines 50

# Restart application
pm2 restart delauto-api

# If restart fails, check configuration
pm2 describe delauto-api

# Check system resources
free -h
df -h
```

#### Database Recovery
```bash
# Check database status
mongosh --eval "db.serverStatus()"

# If database is down, restart
sudo systemctl restart mongod

# Check for corruption
mongosh --eval "db.runCommand({ validate: 'deliveries' })"

# Restore from backup if needed
mongorestore /backups/latest_backup/mongodb
```

#### Full System Recovery
```bash
# Emergency recovery script
#!/bin/bash

echo "Starting emergency recovery..."

# Stop all services
docker-compose down

# Restore latest backup
LATEST_BACKUP=$(ls -t /backups/delauto_*.tar.gz | head -1)
tar -xzf $LATEST_BACKUP -C /tmp/recovery

# Restore databases
mongorestore /tmp/recovery/mongodb
redis-cli < /tmp/recovery/redis/dump.rdb

# Start services
docker-compose up -d

# Verify recovery
sleep 30
HEALTH=$(curl -s http://localhost:3000/health | jq -r '.status')

if [ "$HEALTH" = "healthy" ]; then
    echo "Recovery successful"
    # Send success notification
else
    echo "Recovery failed"
    # Send failure alert
fi

# Clean up
rm -rf /tmp/recovery
```

## Monitoring Setup

### Automated Monitoring

#### Nagios/Icinga Configuration
```bash
# Check application health
define service {
    use                     generic-service
    host_name               delauto-server
    service_description     DelAuto Application Health
    check_command           check_http!-u /health -s healthy
}

# Check database connectivity
define service {
    use                     generic-service
    host_name               delauto-db
    service_description     MongoDB Connectivity
    check_command           check_mongodb
}

# Check Redis connectivity
define service {
    use                     generic-service
    host_name               delauto-cache
    service_description     Redis Connectivity
    check_command           check_redis
}
```

#### Prometheus Metrics
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'delauto-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'

  - job_name: 'mongodb'
    static_configs:
      - targets: ['localhost:9216']

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
```

### Alert Configuration

#### Alert Rules
```yaml
# alert_rules.yml
groups:
  - name: delauto
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}%"

      - alert: DatabaseDown
        expr: mongodb_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MongoDB is down"
          description: "MongoDB has been down for more than 1 minute"
```

## Documentation Updates

### Maintenance Documentation
```bash
# Update maintenance procedures
cat > maintenance-schedule.md << EOF
# Maintenance Schedule

## Daily Tasks
- [ ] System health checks
- [ ] Log rotation
- [ ] Backup verification

## Weekly Tasks
- [ ] Database optimization
- [ ] Cache cleanup
- [ ] Queue maintenance

## Monthly Tasks
- [ ] Security updates
- [ ] Performance tuning
- [ ] Data archiving

## Quarterly Tasks
- [ ] System audits
- [ ] Backup strategy review
- [ ] Compliance checks
EOF
```

### Runbook Creation
```bash
# Create incident response runbook
cat > incident-response-runbook.md << EOF
# Incident Response Runbook

## 1. Detection
- Monitor alerts from various sources
- Check system dashboards
- Review error logs

## 2. Assessment
- Determine impact and scope
- Identify affected components
- Assess business impact

## 3. Containment
- Isolate affected systems
- Stop the bleeding
- Implement temporary fixes

## 4. Recovery
- Restore from backups
- Apply permanent fixes
- Test system functionality

## 5. Lessons Learned
- Document incident details
- Update procedures
- Implement preventive measures
EOF
```

This comprehensive maintenance guide ensures the DelAuto system remains reliable, secure, and performant through regular upkeep and proactive monitoring.