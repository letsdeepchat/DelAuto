# Production Deployment Guide

This guide covers deploying the DelAuto system to production environments.

## Prerequisites

### Infrastructure Requirements

#### Minimum Production Requirements
- **CPU**: 2 vCPUs (4+ recommended)
- **Memory**: 8GB RAM (16GB+ recommended)
- **Storage**: 50GB SSD (100GB+ recommended)
- **Network**: 100Mbps+ bandwidth

#### Recommended Cloud Providers
- **AWS**: EC2, ECS, EKS, Lambda
- **Google Cloud**: Compute Engine, Cloud Run, GKE
- **Azure**: VMs, AKS, Functions
- **DigitalOcean**: Droplets, App Platform
- **Heroku**: For simpler deployments

### Required Services

#### Database
- **MongoDB Atlas** (recommended) or self-hosted MongoDB replica set
- **Redis Cloud** or self-hosted Redis cluster

#### External Services
- **Twilio** account with verified phone number
- **Cloudflare R2** for file storage
- **OpenAI** API access (optional)
- **VAPID keys** for push notifications

## Deployment Strategies

### 1. Docker Container Deployment

#### Dockerfile
```dockerfile
# Use Node.js 20 LTS
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S delauto -u 1001

# Change ownership
RUN chown -R delauto:nodejs /app
USER delauto

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
```

#### Docker Compose (Multi-Service)
```yaml
version: '3.8'

services:
  delauto-api:
    build: .
    container_name: delauto-api
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
    ports:
      - "3000:3000"
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - delauto-network

  redis:
    image: redis:7-alpine
    container_name: delauto-redis
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - delauto-network

  nginx:
    image: nginx:alpine
    container_name: delauto-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl/certs:ro
    depends_on:
      - delauto-api
    restart: unless-stopped
    networks:
      - delauto-network

volumes:
  redis-data:

networks:
  delauto-network:
    driver: bridge
```

#### Nginx Configuration
```nginx
upstream delauto_api {
    server delauto-api:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # API routes
    location /api/ {
        proxy_pass http://delauto_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Rate limiting
        limit_req zone=api burst=100 nodelay;
    }

    # Static files
    location /public/ {
        proxy_pass http://delauto_api;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        proxy_pass http://delauto_api;
        access_log off;
    }

    # Swagger docs
    location /api-docs/ {
        proxy_pass http://delauto_api;
    }
}
```

### 2. Cloud Platform Deployment

#### AWS EC2 Deployment

**User Data Script:**
```bash
#!/bin/bash
# Update system
yum update -y

# Install Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# Install PM2
npm install -g pm2

# Clone repository
cd /home/ec2-user
git clone https://github.com/your-org/delauto.git
cd delauto

# Install dependencies
npm ci --only=production

# Create environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000
MONGODB_URI=${MONGODB_URI}
REDIS_URL=${REDIS_URL}
JWT_SECRET=${JWT_SECRET}
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
EOF

# Start application with PM2
pm2 start src/index.js --name delauto-api
pm2 startup
pm2 save
```

#### AWS ECS/Fargate Deployment

**Task Definition:**
```json
{
  "family": "delauto-api",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "delauto-api",
      "image": "your-registry/delauto-api:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {"name": "MONGODB_URI", "valueFrom": "arn:aws:secretsmanager:region:account:secret:delauto/mongodb"},
        {"name": "JWT_SECRET", "valueFrom": "arn:aws:secretsmanager:region:account:secret:delauto/jwt"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/delauto-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### Heroku Deployment

**Procfile:**
```
web: npm start
worker: npm run worker
```

**Heroku Commands:**
```bash
# Create app
heroku create delauto-api

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-jwt-secret
heroku config:set MONGODB_URI=your-mongodb-uri

# Deploy
git push heroku main

# Scale dynos
heroku ps:scale web=1 worker=1
```

### 3. Process Management

#### PM2 Configuration
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'delauto-api',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

#### Systemd Service
```ini
# /etc/systemd/system/delauto.service
[Unit]
Description=DelAuto API Server
After=network.target

[Service]
Type=simple
User=delauto
Group=delauto
WorkingDirectory=/opt/delauto
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=delauto

[Install]
WantedBy=multi-user.target
```

## Environment Configuration

### Production Environment Variables
```bash
# Server
NODE_ENV=production
PORT=3000
BASE_URL=https://api.yourdomain.com

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/delauto_prod
REDIS_URL=redis://prod-redis:6379

# Security
JWT_SECRET=generated-production-secret
API_KEY_PREFIX=da_prod

# External Services
TWILIO_ACCOUNT_SID=production-sid
TWILIO_AUTH_TOKEN=production-token
TWILIO_PHONE_NUMBER=+1234567890

# Cloud Storage
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=production-key
CLOUDFLARE_SECRET_ACCESS_KEY=production-secret
CLOUDFLARE_R2_BUCKET=delauto-prod-recordings

# Monitoring
CLOUDWATCH_ENABLED=true
CLOUDWATCH_LOG_GROUP=/delauto/prod/api
CLOUDWATCH_REGION=us-east-1

# Performance
CACHE_DEFAULT_TTL=7200
RATE_LIMIT_REQUESTS=2000
RATE_LIMIT_WINDOW_MS=900000
```

### Secrets Management

#### AWS Secrets Manager
```bash
# Store secrets
aws secretsmanager create-secret \
  --name delauto/prod/database \
  --secret-string '{"username":"dbuser","password":"dbpass"}'

# Retrieve in application
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  return JSON.parse(data.SecretString);
}
```

#### Environment-Specific Secrets
- Use different secrets for each environment
- Rotate secrets every 90 days
- Audit secret access logs
- Never log sensitive values

## Load Balancing

### Nginx Load Balancer Configuration
```nginx
upstream delauto_backend {
    least_conn;
    server 10.0.1.10:3000 weight=1;
    server 10.0.1.11:3000 weight=1;
    server 10.0.1.12:3000 weight=1;
    keepalive 32;
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://delauto_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://delauto_backend;
        access_log off;
    }
}
```

### AWS ALB Configuration
```hcl
# Terraform configuration
resource "aws_lb" "delauto_api" {
  name               = "delauto-api-lb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.lb_sg.id]
  subnets           = aws_subnet.public.*.id

  enable_deletion_protection = true
}

resource "aws_lb_target_group" "delauto_api" {
  name        = "delauto-api-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }
}

resource "aws_lb_listener" "delauto_api" {
  load_balancer_arn = aws_lb.delauto_api.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.delauto_api.arn
  }
}
```

## SSL/TLS Configuration

### Let's Encrypt (Free SSL)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### AWS ACM (Managed SSL)
```hcl
resource "aws_acm_certificate" "cert" {
  domain_name       = "api.yourdomain.com"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}
```

## Database Production Setup

### MongoDB Atlas Configuration
```javascript
// Production connection options
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 50,
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,
  bufferMaxEntries: 0,
  retryWrites: true,
  retryReads: true,
  readPreference: 'secondaryPreferred',
  writeConcern: {
    w: 'majority',
    wtimeout: 5000
  }
});
```

### Redis Cluster Setup
```javascript
// Redis cluster configuration
const Redis = require('ioredis');

const redis = new Redis.Cluster([
  {
    host: 'redis-cluster-0001-001.redis-cluster.example.com',
    port: 6379
  },
  {
    host: 'redis-cluster-0001-002.redis-cluster.example.com',
    port: 6379
  }
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    tls: {}
  },
  clusterRetryDelay: 100,
  enableReadyCheck: false
});
```

## Monitoring and Logging

### Application Monitoring
```javascript
// Prometheus metrics
const promClient = require('prom-client');
const register = new promClient.Registry();

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

register.registerMetric(httpRequestDuration);

// Middleware to collect metrics
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  next();
});
```

### Centralized Logging
```javascript
// Winston with CloudWatch
const winston = require('winston');
const CloudWatchTransport = require('winston-cloudwatch');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'delauto-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new CloudWatchTransport({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      logStreamName: process.env.CLOUDWATCH_LOG_STREAM,
      awsRegion: process.env.CLOUDWATCH_REGION,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY
    })
  ]
});
```

## Backup and Recovery

### Database Backup
```bash
# MongoDB Atlas automated backups
# Configure in Atlas dashboard or use mongodump

# Manual backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGODB_URI" --out="/backups/delauto_$DATE"
```

### Application Backup
```bash
# Backup application data
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/delauto_$DATE"

mkdir -p $BACKUP_DIR

# Backup logs
cp -r logs $BACKUP_DIR/

# Backup configuration (without secrets)
cp .env.example $BACKUP_DIR/
cp package.json $BACKUP_DIR/

# Create archive
tar -czf "${BACKUP_DIR}.tar.gz" $BACKUP_DIR
```

## Performance Optimization

### Production Optimizations
```javascript
// Compression
const compression = require('compression');
app.use(compression({
  level: 6,
  threshold: 1024
}));

// Caching
const apicache = require('apicache');
app.use(apicache.middleware('5 minutes'));

// Connection pooling
const mongoose = require('mongoose');
mongoose.connect(uri, {
  maxPoolSize: 100,
  minPoolSize: 20
});
```

### CDN Integration
```javascript
// Cloudflare CDN for static assets
app.use('/public', express.static('public', {
  maxAge: '1y',
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));
```

## Security Hardening

### Production Security Headers
```javascript
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.twilio.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' // skip rate limiting for localhost
});
app.use(limiter);
```

## Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Database connections tested
- [ ] External services configured
- [ ] SSL certificates obtained
- [ ] DNS records updated
- [ ] Security groups configured
- [ ] Monitoring alerts set up

### Deployment Steps
- [ ] Code deployed to staging
- [ ] Staging tests passed
- [ ] Database migrations run
- [ ] Load balancer configured
- [ ] SSL certificates installed
- [ ] Monitoring enabled
- [ ] Backup procedures tested

### Post-Deployment
- [ ] Application health verified
- [ ] Logs monitoring active
- [ ] Performance metrics collected
- [ ] User acceptance testing completed
- [ ] Rollback plan documented
- [ ] Team notified of deployment

## Troubleshooting Production Issues

### Common Production Problems

#### High Memory Usage
```bash
# Check memory usage
pm2 monit

# Restart with memory limit
pm2 restart delauto-api --max-memory-restart 1G
```

#### Database Connection Issues
```bash
# Check database connectivity
mongosh $MONGODB_URI --eval "db.runCommand({ping: 1})"

# Monitor connection pool
mongosh $MONGODB_URI --eval "db.serverStatus().connections"
```

#### Slow Response Times
```bash
# Enable query profiling
db.setProfilingLevel(2)

# Check slow queries
db.system.profile.find().sort({ millis: -1 }).limit(5)
```

This comprehensive production deployment guide ensures that DelAuto can be reliably deployed and maintained in production environments with high availability, security, and performance.