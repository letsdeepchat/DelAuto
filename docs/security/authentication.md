# Authentication Security

This document details the authentication mechanisms and security measures implemented in DelAuto.

## Authentication Architecture

### Multi-Factor Authentication (MFA)

#### Implementation Plan
```javascript
// MFA middleware (future implementation)
const requireMFA = async (req, res, next) => {
  const user = req.agent;

  if (user.mfaEnabled && !req.session.mfaVerified) {
    // Generate TOTP code
    const totp = speakeasy.totp({
      secret: user.mfaSecret,
      encoding: 'base32'
    });

    // Send code via SMS or email
    await sendMFACode(user.phone, totp);

    return res.status(403).json({
      error: 'MFA required',
      mfaRequired: true
    });
  }

  next();
};
```

#### MFA Setup Process
1. User enables MFA in profile settings
2. System generates TOTP secret
3. User scans QR code with authenticator app
4. System verifies setup with test code
5. MFA enabled for future logins

### Password Security

#### Password Requirements
```javascript
const passwordSchema = Joi.string()
  .min(12)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
  .messages({
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  });
```

#### Password Hashing
```javascript
// bcrypt configuration
const bcrypt = require('bcryptjs');

const hashPassword = async (password) => {
  const saltRounds = 12; // Increased from default 10
  return await bcrypt.hash(password, saltRounds);
};

const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
```

#### Password Policies
- **Minimum Length**: 12 characters
- **Complexity Requirements**: Uppercase, lowercase, number, special character
- **History Check**: Prevent reuse of last 5 passwords
- **Expiration**: 90 days (configurable)
- **Lockout**: 5 failed attempts = 30 minute lockout

### Session Management

#### JWT Token Security
```javascript
const jwt = require('jsonwebtoken');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '24h',
    issuer: 'delauto-api',
    audience: 'delauto-clients',
    subject: payload.id
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'delauto-api',
    audience: 'delauto-clients'
  });
};
```

#### Session Storage
```javascript
// Redis session store
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

app.use(session({
  store: new RedisStore({
    client: redisClient,
    ttl: 86400 // 24 hours
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

### API Key Security

#### Key Generation
```javascript
const crypto = require('crypto');

const generateAPIKey = () => {
  // Generate 32-byte random key
  const key = crypto.randomBytes(32).toString('hex');

  // Add environment prefix
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';

  return `da_${env}_${key}`;
};
```

#### Key Validation
```javascript
const validateAPIKey = (apiKey) => {
  // Check format
  const keyRegex = /^da_(live|test)_[a-f0-9]{64}$/;
  if (!keyRegex.test(apiKey)) {
    return false;
  }

  // Check environment
  const env = apiKey.split('_')[1];
  if (env === 'live' && process.env.NODE_ENV !== 'production') {
    return false;
  }

  // Check against database/Redis
  return checkAPIKeyExists(apiKey);
};
```

### OAuth Integration (Future)

#### OAuth 2.0 Flow
```javascript
// OAuth client configuration
const oauth2 = require('simple-oauth2');

const oauthClient = oauth2.create({
  client: {
    id: process.env.OAUTH_CLIENT_ID,
    secret: process.env.OAUTH_CLIENT_SECRET
  },
  auth: {
    tokenHost: 'https://oauth.provider.com',
    tokenPath: '/oauth/token',
    authorizePath: '/oauth/authorize'
  }
});

// Authorization code flow
const authorizationUri = oauthClient.authorizationCode.authorizeURL({
  redirect_uri: 'https://yourapp.com/callback',
  scope: 'read write',
  state: crypto.randomBytes(16).toString('hex')
});
```

## Authorization Security

### Role-Based Access Control (RBAC)

#### Permission Definitions
```javascript
const permissions = {
  // Delivery permissions
  'deliveries:create': { roles: ['admin'] },
  'deliveries:read': { roles: ['agent', 'admin'] },
  'deliveries:update': { roles: ['agent', 'admin'] },
  'deliveries:delete': { roles: ['admin'] },

  // Analytics permissions
  'analytics:read': { roles: ['agent', 'admin'] },
  'analytics:write': { roles: ['admin'] },

  // Admin permissions
  'users:manage': { roles: ['admin'] },
  'system:configure': { roles: ['admin'] }
};
```

#### Permission Checking
```javascript
const checkPermission = (user, permission) => {
  if (!user || !user.role) {
    return false;
  }

  const permConfig = permissions[permission];
  if (!permConfig) {
    return false;
  }

  return permConfig.roles.includes(user.role);
};

// Middleware for permission checking
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!checkPermission(req.agent, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permission
      });
    }
    next();
  };
};
```

### Attribute-Based Access Control (ABAC)

#### Resource Ownership
```javascript
const checkResourceOwnership = (user, resource, resourceId) => {
  // Agents can only access their own deliveries
  if (user.role === 'agent' && resource === 'delivery') {
    return Delivery.findOne({
      _id: resourceId,
      agent_id: user.id
    }).then(delivery => !!delivery);
  }

  // Admins can access all resources
  if (user.role === 'admin') {
    return true;
  }

  return false;
};
```

#### Contextual Permissions
```javascript
const checkContextualPermission = (user, action, resource, context) => {
  // Time-based restrictions
  if (action === 'update' && resource === 'delivery') {
    const now = new Date();
    const deliveryTime = new Date(context.scheduled_time);

    // Prevent updates within 1 hour of delivery
    if (deliveryTime - now < 60 * 60 * 1000) {
      return false;
    }
  }

  // Location-based restrictions (future)
  if (context.location && user.allowedLocations) {
    return user.allowedLocations.includes(context.location);
  }

  return true;
};
```

## Security Headers

### Helmet Configuration
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.twilio.com", "wss://yourapp.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
```

### Custom Security Headers
```javascript
// Custom security middleware
const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');

  // Add custom security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Add request ID for tracking
  res.setHeader('X-Request-ID', req.id || generateRequestId());

  next();
};
```

## Rate Limiting

### API Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 900 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  onLimitReached: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.get('User-Agent')
    });
  }
});

// Stricter limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth attempts per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  skipSuccessfulRequests: true, // Don't count successful logins
  skipFailedRequests: false // Count failed attempts
});
```

### Distributed Rate Limiting
```javascript
// Redis-based distributed rate limiting
const RedisStore = require('rate-limit-redis');

const distributedLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:api'
  }),
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => {
    // Use API key or IP for rate limiting
    return req.headers['x-api-key'] || req.ip;
  }
});
```

## Input Validation & Sanitization

### Request Validation
```javascript
const Joi = require('joi');

// User input validation schema
const userInputSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(12).max(128).required(),
  name: Joi.string().min(2).max(100).trim().required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
});

// Middleware for validation
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    req.body = value; // Use sanitized values
    next();
  };
};
```

### SQL Injection Prevention
```javascript
// MongoDB injection prevention
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove potential MongoDB operators
    return input.replace(/[\$]/g, '');
  }
  return input;
};

// Use parameterized queries
const safeQuery = (userId) => {
  return User.findOne({
    _id: sanitizeInput(userId),
    is_active: true
  });
};
```

## Audit Logging

### Authentication Events
```javascript
const auditAuth = (event, userId, details) => {
  const auditEntry = {
    timestamp: new Date(),
    event,
    userId,
    ip: details.ip,
    userAgent: details.userAgent,
    details
  };

  // Log to security audit log
  securityLogger.info('Authentication Event', auditEntry);

  // Store in audit collection
  AuditLog.create(auditEntry);

  // Send to SIEM if critical
  if (['failed_login', 'suspicious_activity'].includes(event)) {
    siemClient.send(auditEntry);
  }
};

// Usage
auditAuth('successful_login', user._id, {
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  method: 'password'
});
```

### Authorization Events
```javascript
const auditAccess = (userId, resource, action, success, details) => {
  const auditEntry = {
    timestamp: new Date(),
    event: 'access_attempt',
    userId,
    resource,
    action,
    success,
    details
  };

  auditLogger.info('Access Control Event', auditEntry);
};
```

## Brute Force Protection

### Login Attempt Monitoring
```javascript
const loginAttempts = new Map();

const checkBruteForce = (identifier) => {
  const attempts = loginAttempts.get(identifier) || [];
  const now = Date.now();

  // Remove old attempts (older than 15 minutes)
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);

  if (recentAttempts.length >= 5) {
    // Account locked for 30 minutes
    return { blocked: true, remainingTime: 30 * 60 * 1000 };
  }

  return { blocked: false, attempts: recentAttempts.length };
};

const recordFailedAttempt = (identifier) => {
  const attempts = loginAttempts.get(identifier) || [];
  attempts.push(Date.now());

  // Keep only last 10 attempts
  if (attempts.length > 10) {
    attempts.shift();
  }

  loginAttempts.set(identifier, attempts);
};
```

### Progressive Delays
```javascript
const getLoginDelay = (attemptCount) => {
  const delays = [0, 1000, 2000, 4000, 8000, 15000]; // Progressive delays in ms
  return delays[Math.min(attemptCount, delays.length - 1)];
};
```

## Security Monitoring

### Real-time Alerts
```javascript
const securityAlerts = {
  suspiciousLogin: (details) => {
    alertSystem.send('Suspicious login detected', {
      severity: 'high',
      details
    });
  },

  bruteForceAttempt: (details) => {
    alertSystem.send('Brute force attack detected', {
      severity: 'critical',
      details
    });
  },

  privilegeEscalation: (details) => {
    alertSystem.send('Privilege escalation attempt', {
      severity: 'critical',
      details
    });
  }
};
```

### Automated Responses
```javascript
const automatedResponses = {
  blockIP: async (ip) => {
    await firewall.blockIP(ip, 3600); // Block for 1 hour
    logger.warn(`IP ${ip} blocked due to security violation`);
  },

  lockAccount: async (userId) => {
    await User.findByIdAndUpdate(userId, { locked: true });
    // Send notification email
    await sendAccountLockedEmail(userId);
  },

  requireMFA: async (userId) => {
    await User.findByIdAndUpdate(userId, { mfaRequired: true });
    await sendMFARequiredEmail(userId);
  }
};
```

## Compliance

### GDPR Compliance
```javascript
// Data export for user
app.get('/api/privacy/export', authenticateJWT, async (req, res) => {
  const userId = req.agent.id;

  const exportData = {
    profile: await User.findById(userId).select('-password'),
    sessions: await Session.find({ userId }),
    auditLogs: await AuditLog.find({ userId }).limit(1000),
    // Include all user-related data
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="data-export.json"');
  res.json(exportData);
});

// Right to be forgotten
app.delete('/api/privacy/delete', authenticateJWT, async (req, res) => {
  const userId = req.agent.id;

  // Anonymize user data
  await User.findByIdAndUpdate(userId, {
    deleted: true,
    email: `deleted-${userId}@anonymous.local`,
    name: 'Deleted User',
    phone: null
  });

  // Queue data deletion job
  await queueService.add('data-deletion', { userId });

  res.json({ message: 'Data deletion initiated' });
});
```

### Security Testing

#### Automated Security Tests
```javascript
describe('Authentication Security', () => {
  test('should prevent brute force attacks', async () => {
    const email = 'test@example.com';

    // Attempt multiple failed logins
    for (let i = 0; i < 6; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'wrong' })
        .expect(401);
    }

    // Next attempt should be rate limited
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'correct' })
      .expect(429);

    expect(response.body.error).toContain('Too many');
  });

  test('should validate JWT tokens', async () => {
    const invalidToken = 'invalid.jwt.token';

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);

    expect(response.body.error).toBe('Invalid token');
  });

  test('should enforce password complexity', async () => {
    const weakPasswords = ['password', '123456', 'weak'];

    for (const password of weakPasswords) {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password,
          name: 'Test User',
          phone: '+1234567890'
        })
        .expect(400);

      expect(response.body.error).toContain('Password');
    }
  });
});
```

This comprehensive authentication security implementation ensures that DelAuto maintains robust protection against various attack vectors while providing a smooth user experience.