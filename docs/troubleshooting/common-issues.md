# Common Issues and Troubleshooting

This guide covers frequently encountered issues in the DelAuto system and their solutions.

## System Startup Issues

### Application Won't Start

#### Node.js Version Issues
**Symptoms:**
- `Error: Node.js version x.x.x is not supported`
- Application crashes immediately on startup

**Solutions:**
```bash
# Check current Node.js version
node --version

# Install correct version using nvm
nvm install 20
nvm use 20
nvm alias default 20

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

#### Missing Dependencies
**Symptoms:**
- `Error: Cannot find module 'express'`
- Multiple import errors on startup

**Solutions:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for missing peer dependencies
npm ls --depth=0

# Update npm if needed
npm install -g npm@latest
```

#### Environment Variables Missing
**Symptoms:**
- `Error: MONGODB_URI is required`
- Database connection failures

**Solutions:**
```bash
# Check if .env file exists
ls -la .env

# Copy from template
cp .env.example .env

# Edit environment variables
nano .env

# Validate required variables
node -e "require('dotenv').config(); console.log(process.env.MONGODB_URI ? 'OK' : 'MISSING')"
```

### Database Connection Issues

#### MongoDB Connection Failed
**Symptoms:**
- `MongoServerError: Authentication failed`
- `MongoNetworkError: connect ECONNREFUSED`

**Solutions:**
```bash
# Check MongoDB service status
sudo systemctl status mongod

# Start MongoDB if stopped
sudo systemctl start mongod

# Test connection
mongosh mongodb://localhost:27017/delauto

# Check connection string format
# For local: mongodb://localhost:27017/delauto
# For Atlas: mongodb+srv://user:pass@cluster.mongodb.net/delauto
```

#### Redis Connection Failed
**Symptoms:**
- `Error: Redis connection failed`
- Caching not working

**Solutions:**
```bash
# Check Redis service status
redis-cli ping

# Start Redis if stopped
sudo systemctl start redis

# Check Redis configuration
redis-cli config get *

# Test connection with password
redis-cli -a yourpassword ping
```

### External Service Issues

#### Twilio Connection Failed
**Symptoms:**
- `Error: Twilio authentication failed`
- Voice calls not working

**Solutions:**
```bash
# Verify credentials
echo $TWILIO_ACCOUNT_SID
echo $TWILIO_AUTH_TOKEN

# Test Twilio API
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"

# Check phone number format
# Should be: +1234567890
```

#### OpenAI API Issues
**Symptoms:**
- `Error: OpenAI authentication failed`
- AI features not working

**Solutions:**
```bash
# Verify API key
echo $OPENAI_API_KEY | head -c 10  # Should start with sk-

# Test API connection
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Check API quota
# Visit: https://platform.openai.com/usage
```

## Runtime Issues

### High Memory Usage

#### Memory Leak Detection
**Symptoms:**
- Application using excessive memory
- Frequent crashes due to out-of-memory errors

**Solutions:**
```bash
# Monitor memory usage
node --inspect app.js &
# Open Chrome DevTools: chrome://inspect

# Check heap usage
node -e "
const v8 = require('v8');
const heap = v8.getHeapStatistics();
console.log('Heap used:', (heap.used_heap_size / 1024 / 1024).toFixed(2), 'MB');
console.log('Heap total:', (heap.total_heap_size / 1024 / 1024).toFixed(2), 'MB');
"

# Enable garbage collection logging
node --trace-gc --max-old-space-size=4096 app.js
```

#### Memory Optimization
```javascript
// Use streaming for large data
const { pipeline } = require('stream');
const fs = require('fs');

pipeline(
  fs.createReadStream('large-file.txt'),
  transformStream,
  fs.createWriteStream('output.txt'),
  (err) => {
    if (err) console.error('Pipeline failed:', err);
  }
);

// Clean up event listeners
const cleanup = () => {
  process.removeAllListeners();
  // Close database connections
  mongoose.connection.close();
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
```

### Slow Performance

#### Database Query Optimization
**Symptoms:**
- Slow API responses
- Database queries taking too long

**Solutions:**
```bash
# Enable query profiling
db.setProfilingLevel(2, { slowms: 100 });

# Check slow queries
db.system.profile.find().sort({ millis: -1 }).limit(5);

# Analyze query performance
db.deliveries.find({ status: 'completed' }).explain('executionStats');

# Add missing indexes
db.deliveries.createIndex({ status: 1, createdAt: -1 });
```

#### Cache Issues
**Symptoms:**
- Cache not working
- High database load

**Solutions:**
```bash
# Check Redis connectivity
redis-cli ping

# Clear cache
redis-cli flushall

# Monitor cache hit rate
redis-cli info stats | grep keyspace

# Check cache configuration
redis-cli config get maxmemory
redis-cli config get maxmemory-policy
```

### API Errors

#### Authentication Failures
**Symptoms:**
- `401 Unauthorized` errors
- JWT token issues

**Solutions:**
```bash
# Verify JWT secret
echo $JWT_SECRET | wc -c  # Should be > 32 characters

# Test token generation
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({ id: 'test' }, process.env.JWT_SECRET);
console.log('Token:', token);
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('Decoded:', decoded);
"

# Check token expiration
# Tokens expire after 24 hours by default
```

#### Rate Limiting Issues
**Symptoms:**
- `429 Too Many Requests` errors
- Legitimate requests being blocked

**Solutions:**
```javascript
// Check rate limit configuration
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});
```

### Queue Processing Issues

#### Job Queue Backlog
**Symptoms:**
- Jobs not processing
- Queue size growing

**Solutions:**
```bash
# Check queue status
# Using Bull dashboard or Redis CLI
redis-cli keys "bull:*:waiting"

# Restart queue workers
pm2 restart delauto-queue-worker

# Clear stuck jobs
redis-cli del bull:customer-calls:stalled

# Monitor queue health
curl http://localhost:3000/health | jq .services.queue
```

#### Failed Job Handling
**Symptoms:**
- Jobs failing repeatedly
- Error logs filling up

**Solutions:**
```javascript
// Implement proper error handling in job processors
const jobProcessor = async (job) => {
  try {
    const result = await processJob(job.data);
    return result;
  } catch (error) {
    logger.error('Job processing failed:', error);

    // Don't retry certain errors
    if (error.code === 'PERMANENT_FAILURE') {
      throw new Error('Permanent failure - do not retry');
    }

    throw error; // Will be retried
  }
};

// Configure retry options
const queue = new Bull('customer-calls', {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 50,
    removeOnFail: 100,
  }
});
```

## Network and Connectivity Issues

### Webhook Delivery Failures
**Symptoms:**
- Twilio webhooks not reaching application
- Call status updates not working

**Solutions:**
```bash
# Check webhook endpoint
curl -X POST http://localhost:3000/api/webhooks/voice \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test&From=%2B1234567890"

# Verify ngrok/tunnel configuration
# For local development
npm install -g ngrok
ngrok http 3000

# Update webhook URLs in Twilio
# Voice: https://your-domain.com/api/webhooks/voice
# Status: https://your-domain.com/api/webhooks/call-status
```

### CORS Issues
**Symptoms:**
- Browser blocking API requests
- `CORS error` in browser console

**Solutions:**
```javascript
// Configure CORS properly
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.CORS_ORIGIN.split(',');
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

## File and Storage Issues

### Recording Storage Problems
**Symptoms:**
- Audio recordings not saving
- File upload failures

**Solutions:**
```bash
# Check Cloudflare R2 configuration
echo $CLOUDFLARE_ACCESS_KEY_ID
echo $CLOUDFLARE_SECRET_ACCESS_KEY

# Test R2 connection
# Install AWS CLI configured for Cloudflare R2
aws s3 ls s3://delauto-recordings --endpoint-url https://<account-id>.r2.cloudflarestorage.com

# Check file permissions
ls -la uploads/
chmod 755 uploads/

# Verify disk space
df -h
```

### Static File Serving Issues
**Symptoms:**
- CSS/JS files not loading
- 404 errors for static assets

**Solutions:**
```javascript
// Configure static file serving
app.use(express.static('public', {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// For SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

## Mobile App Issues

### Push Notification Problems
**Symptoms:**
- Push notifications not received
- VAPID key errors

**Solutions:**
```bash
# Verify VAPID keys
echo $VAPID_PUBLIC_KEY
echo $VAPID_PRIVATE_KEY

# Test push notification
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=$FCM_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "device-token",
    "notification": {
      "title": "Test Notification",
      "body": "This is a test"
    }
  }'
```

### GPS and Location Issues
**Symptoms:**
- Location tracking not working
- Map display problems

**Solutions:**
```javascript
// Check location permissions in app
// iOS: Settings > Privacy > Location Services
// Android: Settings > Apps > DelAuto > Permissions

// Verify GPS coordinates format
const validCoords = /^-?\d{1,3}\.\d{6,15},-?\d{1,2}\.\d{6,15}$/;
if (!validCoords.test(coordinates)) {
  throw new Error('Invalid coordinate format');
}
```

## Development Environment Issues

### Hot Reload Not Working
**Symptoms:**
- Code changes not reflected
- Nodemon not restarting

**Solutions:**
```bash
# Check nodemon configuration
cat nodemon.json

# Restart nodemon
pkill -f nodemon
npm run dev

# Check file watching limits
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Test Suite Failures
**Symptoms:**
- Tests failing unexpectedly
- Database test connections failing

**Solutions:**
```bash
# Clean test database
mongo delauto_test --eval "db.dropDatabase()"

# Run tests with verbose output
npm test -- --verbose

# Check test environment variables
NODE_ENV=test npm test

# Debug specific test
npm test -- --grep "test name"
```

## Production-Specific Issues

### SSL/TLS Certificate Problems
**Symptoms:**
- HTTPS not working
- Certificate validation errors

**Solutions:**
```bash
# Check certificate validity
openssl x509 -in /etc/ssl/certs/delauto.crt -text -noout

# Test SSL connection
openssl s_client -connect yourdomain.com:443

# Renew Let's Encrypt certificate
certbot renew

# Check nginx SSL configuration
nginx -t
nginx -s reload
```

### Load Balancer Issues
**Symptoms:**
- Uneven load distribution
- Health check failures

**Solutions:**
```nginx
# Nginx upstream configuration
upstream delauto_backend {
    least_conn;
    server 10.0.1.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

# Health check endpoint
location /health {
    proxy_pass http://delauto_backend;
    access_log off;
}
```

### Database Replication Issues
**Symptoms:**
- Replication lag
- Read/write splitting problems

**Solutions:**
```bash
# Check replication status
rs.status()

# Check replication lag
rs.printSlaveReplicationInfo()

# Reconfigure replica set
rs.reconfig({
  _id: 'rs0',
  members: [
    { _id: 0, host: 'mongo1:27017' },
    { _id: 1, host: 'mongo2:27017' },
    { _id: 2, host: 'mongo3:27017', arbiterOnly: true }
  ]
})
```

## Emergency Procedures

### System Down
1. **Assess Situation**: Check system status and error logs
2. **Notify Team**: Alert relevant team members
3. **Check Backups**: Verify backup integrity
4. **Failover**: Switch to backup systems if available
5. **Restore Service**: Bring systems back online
6. **Post-Mortem**: Document incident and prevention measures

### Data Loss
1. **Stop Operations**: Halt all write operations
2. **Assess Damage**: Determine scope of data loss
3. **Restore Backup**: Use most recent clean backup
4. **Verify Integrity**: Test restored data
5. **Resume Operations**: Gradually bring systems back online

### Security Breach
1. **Isolate Systems**: Disconnect affected systems
2. **Preserve Evidence**: Don't modify compromised systems
3. **Notify Authorities**: Report to relevant authorities if required
4. **Change Credentials**: Rotate all compromised credentials
5. **Security Audit**: Conduct thorough security assessment

## Getting Help

### Support Resources
- **Documentation**: Check this troubleshooting guide
- **Logs**: Review application and system logs
- **Monitoring**: Check system monitoring dashboards
- **Team Chat**: Contact development team
- **Issue Tracker**: Create detailed bug reports

### Information to Provide
When reporting issues, include:
- Error messages and stack traces
- System environment details
- Steps to reproduce the issue
- Recent changes or deployments
- Log excerpts from relevant time period
- System resource usage (CPU, memory, disk)

This comprehensive troubleshooting guide should help resolve most common issues encountered in the DelAuto system. For persistent or complex issues, contact the development team with detailed information about the problem.