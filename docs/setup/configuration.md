# Configuration Guide

This guide explains all configuration options available in the DelAuto system.

## Environment Variables

### Core Configuration

#### Server Settings
```bash
# Application environment
NODE_ENV=development  # development | staging | production

# Server port
PORT=3000

# Base URL for webhooks and redirects
BASE_URL=http://localhost:3000
```

#### Database Configuration
```bash
# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/delauto

# MongoDB connection options
MONGODB_MAX_POOL_SIZE=10
MONGODB_MIN_POOL_SIZE=5
MONGODB_MAX_IDLE_TIME_MS=30000
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
MONGODB_SOCKET_TIMEOUT_MS=45000
MONGODB_BUFFER_COMMANDS=false
MONGODB_BUFFER_MAX_ENTRIES=0
```

#### Redis Configuration
```bash
# Redis connection URL
REDIS_URL=redis://localhost:6379

# Redis connection options
REDIS_MAX_RETRIES_PER_REQUEST=3
REDIS_RETRY_DELAY_ON_FAILOVER=100
REDIS_ENABLE_READY_CHECK=false
REDIS_LAZY_CONNECT=true
```

### Authentication & Security

#### JWT Configuration
```bash
# JWT secret key (generate with: openssl rand -hex 32)
JWT_SECRET=your-super-secure-jwt-secret-here

# JWT expiration time
JWT_EXPIRES_IN=24h

# JWT issuer
JWT_ISSUER=delauto-api

# JWT audience
JWT_AUDIENCE=delauto-clients
```

#### API Key Configuration
```bash
# API key prefix for identification
API_KEY_PREFIX=da

# API key environment suffixes
API_KEY_DEV_SUFFIX=_dev
API_KEY_PROD_SUFFIX=_prod

# API key rate limits
API_KEY_RATE_LIMIT_REQUESTS=1000
API_KEY_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### Twilio Configuration

#### Core Settings
```bash
# Twilio account credentials
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Twilio webhook validation
TWILIO_WEBHOOK_VALIDATION_ENABLED=true
```

#### Voice Settings
```bash
# Voice call timeout (seconds)
TWILIO_VOICE_TIMEOUT=30

# Maximum recording duration (seconds)
TWILIO_MAX_RECORDING_DURATION=300

# Recording transcribe callback
TWILIO_TRANSCRIBE_CALLBACK=true

# Voice language
TWILIO_VOICE_LANGUAGE=en-US

# Voice gender
TWILIO_VOICE_GENDER=alice
```

#### Call Retry Configuration
```bash
# Maximum retry attempts
CALL_MAX_RETRIES=3

# Retry delays (minutes)
CALL_RETRY_DELAY_1=15
CALL_RETRY_DELAY_2=60
CALL_RETRY_DELAY_3=120

# Retry only for specific statuses
CALL_RETRY_STATUSES=no-answer,busy
```

### OpenAI Configuration

#### API Settings
```bash
# OpenAI API key
OPENAI_API_KEY=your-openai-api-key

# OpenAI organization ID (optional)
OPENAI_ORGANIZATION_ID=your-org-id

# API request timeout (milliseconds)
OPENAI_TIMEOUT=30000
```

#### Model Configuration
```bash
# Whisper model for transcription
OPENAI_WHISPER_MODEL=whisper-1

# GPT model for analysis
OPENAI_GPT_MODEL=gpt-4

# Voice authentication model
OPENAI_VOICE_AUTH_MODEL=whisper-1
```

#### Cost Management
```bash
# Monthly budget limit (USD)
OPENAI_MONTHLY_BUDGET=100.00

# Per-request cost alerting threshold
OPENAI_COST_ALERT_THRESHOLD=10.00

# Enable cost tracking
OPENAI_COST_TRACKING_ENABLED=true
```

### Cloudflare R2 Configuration

#### Storage Settings
```bash
# Cloudflare account ID
CLOUDFLARE_ACCOUNT_ID=your-account-id

# R2 access credentials
CLOUDFLARE_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_SECRET_ACCESS_KEY=your-secret-access-key

# R2 bucket name
CLOUDFLARE_R2_BUCKET=delauto-recordings

# R2 public URL
CLOUDFLARE_R2_PUBLIC_URL=https://your-domain.r2.cloudflarestorage.com
```

#### Upload Configuration
```bash
# Maximum file size (bytes)
R2_MAX_FILE_SIZE=104857600  # 100MB

# Upload timeout (milliseconds)
R2_UPLOAD_TIMEOUT=60000

# Enable multipart uploads
R2_MULTIPART_ENABLED=true

# Multipart chunk size (bytes)
R2_MULTIPART_CHUNK_SIZE=8388608  # 8MB
```

### Push Notification Configuration

#### VAPID Keys
```bash
# VAPID public key (safe to expose to frontend)
VAPID_PUBLIC_KEY=your-vapid-public-key

# VAPID private key (keep secret)
VAPID_PRIVATE_KEY=your-vapid-private-key

# VAPID subject (your domain)
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

#### Notification Settings
```bash
# Default notification TTL (seconds)
PUSH_NOTIFICATION_TTL=86400  # 24 hours

# Maximum notification payload size (bytes)
PUSH_NOTIFICATION_MAX_SIZE=4096

# Enable silent notifications
PUSH_NOTIFICATION_SILENT_ENABLED=false
```

### CORS Configuration

#### Basic Settings
```bash
# Allowed origins (comma-separated)
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Allowed methods
CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS

# Allowed headers
CORS_HEADERS=Content-Type,Authorization,X-API-Key,X-Requested-With

# Allow credentials
CORS_CREDENTIALS=true

# Max age for preflight cache (seconds)
CORS_MAX_AGE=86400
```

### Rate Limiting Configuration

#### General API Limits
```bash
# Requests per window
RATE_LIMIT_REQUESTS=1000

# Window duration (milliseconds)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes

# Skip rate limiting for these IPs
RATE_LIMIT_SKIP_IPS=127.0.0.1,::1

# Rate limit response message
RATE_LIMIT_MESSAGE=Too many requests from this IP, please try again later.
```

#### Authentication Limits
```bash
# Login attempts per window
AUTH_RATE_LIMIT_REQUESTS=10
AUTH_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes

# Registration attempts per window
REGISTER_RATE_LIMIT_REQUESTS=5
REGISTER_RATE_LIMIT_WINDOW_MS=3600000  # 1 hour
```

#### Admin Limits
```bash
# Admin endpoint requests per window
ADMIN_RATE_LIMIT_REQUESTS=100
ADMIN_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
```

### Logging Configuration

#### Winston Settings
```bash
# Log level
LOG_LEVEL=info

# Log format
LOG_FORMAT=json  # json | simple | combined

# Enable console logging
LOG_CONSOLE_ENABLED=true

# Enable file logging
LOG_FILE_ENABLED=true

# Log file path
LOG_FILE_PATH=logs/app.log

# Error log file path
LOG_ERROR_FILE_PATH=logs/error.log

# Maximum log file size (bytes)
LOG_MAX_SIZE=10485760  # 10MB

# Maximum log files to keep
LOG_MAX_FILES=5
```

#### CloudWatch Integration (Production)
```bash
# Enable CloudWatch logging
CLOUDWATCH_ENABLED=true

# CloudWatch log group name
CLOUDWATCH_LOG_GROUP=delauto-api

# CloudWatch log stream name
CLOUDWATCH_LOG_STREAM=app-logs

# AWS region
CLOUDWATCH_REGION=us-east-1

# AWS access credentials
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
```

### Monitoring Configuration

#### Health Check Settings
```bash
# Health check enabled
HEALTH_CHECK_ENABLED=true

# Health check path
HEALTH_CHECK_PATH=/health

# Database health check timeout (milliseconds)
HEALTH_DB_TIMEOUT=5000

# Redis health check timeout (milliseconds)
HEALTH_REDIS_TIMEOUT=3000

# External service health check timeout (milliseconds)
HEALTH_EXTERNAL_TIMEOUT=10000
```

#### Metrics Collection
```bash
# Enable metrics collection
METRICS_ENABLED=true

# Metrics collection interval (milliseconds)
METRICS_INTERVAL=60000  # 1 minute

# Metrics retention period (days)
METRICS_RETENTION_DAYS=30

# Enable detailed request metrics
METRICS_REQUEST_DETAILS=true

# Enable database query metrics
METRICS_DB_QUERIES=true
```

### Cache Configuration

#### Redis Cache Settings
```bash
# Default cache TTL (seconds)
CACHE_DEFAULT_TTL=3600  # 1 hour

# Analytics cache TTL (seconds)
CACHE_ANALYTICS_TTL=1800  # 30 minutes

# User session cache TTL (seconds)
CACHE_SESSION_TTL=86400  # 24 hours

# Enable cache compression
CACHE_COMPRESSION_ENABLED=true

# Cache key prefix
CACHE_KEY_PREFIX=delauto:
```

### Queue Configuration

#### Bull Queue Settings
```bash
# Queue concurrency
QUEUE_CONCURRENCY=5

# Queue retry attempts
QUEUE_RETRY_ATTEMPTS=3

# Queue retry delay (milliseconds)
QUEUE_RETRY_DELAY=5000

# Queue remove completed jobs after (milliseconds)
QUEUE_REMOVE_COMPLETED_AFTER=3600000  # 1 hour

# Queue remove failed jobs after (milliseconds)
QUEUE_REMOVE_FAILED_AFTER=86400000  # 24 hours
```

### Email Configuration (Future)

#### SMTP Settings
```bash
# SMTP host
SMTP_HOST=smtp.gmail.com

# SMTP port
SMTP_PORT=587

# SMTP secure (TLS)
SMTP_SECURE=false

# SMTP authentication
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email from address
EMAIL_FROM=noreply@yourdomain.com

# Email templates path
EMAIL_TEMPLATES_PATH=templates/email
```

### Analytics Configuration

#### Data Collection
```bash
# Enable analytics collection
ANALYTICS_ENABLED=true

# Analytics data retention (days)
ANALYTICS_RETENTION_DAYS=365

# Enable real-time analytics
ANALYTICS_REAL_TIME_ENABLED=true

# Analytics cache TTL (seconds)
ANALYTICS_CACHE_TTL=300  # 5 minutes
```

#### AI Features
```bash
# Enable AI transcription
AI_TRANSCRIPTION_ENABLED=true

# Enable AI analysis
AI_ANALYSIS_ENABLED=true

# Enable voice authentication
AI_VOICE_AUTH_ENABLED=true

# AI processing timeout (seconds)
AI_PROCESSING_TIMEOUT=60
```

## Configuration Files

### Environment File Structure
```
.env
├── .env.example      # Template file
├── .env.local        # Local development overrides
├── .env.development  # Development environment
├── .env.staging      # Staging environment
├── .env.production   # Production environment
└── .env.test         # Test environment
```

### Configuration Validation

The application validates configuration on startup:

```javascript
// config/validation.js
const Joi = require('joi');

const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').required(),
  PORT: Joi.number().integer().min(1000).max(9999).default(3000),
  MONGODB_URI: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  // ... more validations
});

const { error } = configSchema.validate(process.env);
if (error) {
  throw new Error(`Configuration validation error: ${error.message}`);
}
```

## Environment-Specific Configurations

### Development Configuration
```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
LOG_CONSOLE_ENABLED=true
CACHE_DEFAULT_TTL=300
METRICS_ENABLED=false
```

### Production Configuration
```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=warn
LOG_CONSOLE_ENABLED=false
CACHE_DEFAULT_TTL=3600
METRICS_ENABLED=true
CLOUDWATCH_ENABLED=true
```

### Test Configuration
```bash
# .env.test
NODE_ENV=test
MONGODB_URI=mongodb://localhost:27017/delauto_test
JWT_SECRET=test_jwt_secret_for_testing_only
LOG_LEVEL=error
CACHE_ENABLED=false
METRICS_ENABLED=false
```

## Configuration Management

### Best Practices

#### Security
- Never commit secrets to version control
- Use different secrets for each environment
- Rotate secrets regularly
- Use environment-specific configuration files

#### Organization
- Group related variables together
- Use consistent naming conventions
- Document all configuration options
- Validate configuration on startup

#### Performance
- Cache configuration values
- Use environment-specific optimizations
- Monitor configuration impact on performance

### Configuration Loading

The application loads configuration in this order:
1. Default values
2. `.env` file
3. Environment-specific file (`.env.${NODE_ENV}`)
4. System environment variables
5. Command-line arguments

```javascript
// config/index.js
require('dotenv').config();
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });

// Load and validate configuration
const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  database: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
    },
  },
  // ... more configuration
};

module.exports = config;
```

## Troubleshooting Configuration

### Common Issues

#### Environment Variables Not Loading
```bash
# Check if .env file exists
ls -la .env

# Check file permissions
chmod 600 .env

# Verify variable loading
node -e "console.log(require('dotenv').config())"
```

#### Configuration Validation Errors
```bash
# Run configuration validation
node -e "require('./config/validation')"

# Check for missing required variables
node -e "console.log(Object.keys(process.env).filter(key => key.startsWith('MONGODB_')))"
```

#### Database Connection Issues
```bash
# Test MongoDB connection
mongosh $MONGODB_URI --eval "db.runCommand({ping: 1})"

# Check connection string format
node -e "const mongoose = require('mongoose'); console.log(mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).then(() => console.log('Connected')).catch(console.error))"
```

### Debug Configuration
```bash
# Enable configuration debugging
DEBUG=config:* npm start

# Print loaded configuration (without secrets)
node -e "const config = require('./config'); console.log(JSON.stringify(config, null, 2))"
```

## Configuration Documentation

### Auto-Generated Documentation
```bash
# Generate configuration documentation
npm run docs:config

# This creates docs/setup/configuration.md with current values
```

### Configuration Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "NODE_ENV": {
      "type": "string",
      "enum": ["development", "staging", "production"],
      "description": "Application environment"
    },
    "PORT": {
      "type": "integer",
      "minimum": 1000,
      "maximum": 9999,
      "description": "Server port number"
    }
    // ... more properties
  },
  "required": ["NODE_ENV", "MONGODB_URI", "JWT_SECRET"]
}
```

This comprehensive configuration system ensures that DelAuto can be deployed across different environments with appropriate security, performance, and feature settings.