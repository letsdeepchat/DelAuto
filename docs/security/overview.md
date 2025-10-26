# Security Overview

This document outlines the security features and best practices implemented in the DelAuto system.

## Security Architecture

### Defense in Depth

DelAuto implements a multi-layered security approach:

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer Security                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │   HTTPS/TLS     │ │ Input Validation│ │   CORS Policy   │ │
│  │   Encryption    │ │   & Sanitization│ │   Restrictions  │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer Security                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │ Authentication  │ │ Authorization   │ │ Rate Limiting   │ │
│  │   (JWT/API)     │ │   (RBAC)        │ │   Protection     │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer Security                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │ Data Encryption │ │ Access Control │ │ Audit Logging   │ │
│  │   (At Rest)     │ │   Policies      │ │   & Monitoring  │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 Infrastructure Security                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │ Network Security│ │ Container       │ │ Secrets         │ │
│  │   (Firewalls)   │ │   Security      │ │   Management    │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Authentication & Authorization

### Authentication Methods

#### 1. JWT Bearer Token Authentication
- **Purpose**: User-specific API access
- **Token Structure**: Header.Payload.Signature
- **Expiration**: 24 hours (configurable)
- **Refresh Mechanism**: Re-authentication required

**Security Features:**
- HS256 algorithm for signing
- Secure secret key (256-bit minimum)
- No sensitive data in payload
- Automatic expiration enforcement

#### 2. API Key Authentication
- **Purpose**: Server-to-server communication
- **Format**: `da_live_xxxxxxxxxxxxxxxx` or `da_test_xxxxxxxxxxxxxxxx`
- **Environment Separation**: Live vs test keys
- **Rate Limiting**: Per key limits

**Security Features:**
- Random generation (32+ characters)
- Environment-specific prefixes
- Immediate revocation capability
- Usage monitoring and alerting

### Authorization (RBAC)

#### User Roles

**Agent Role:**
- Personal delivery access
- Limited analytics viewing
- Delivery status updates
- Push notification subscriptions

**Admin Role:**
- Full system access
- User management
- System configuration
- Complete analytics and reporting

#### Permission Matrix

| Permission | Agent | Admin | Description |
|------------|-------|-------|-------------|
| deliveries:read | Own | All | View deliveries |
| deliveries:write | Assigned | All | Update deliveries |
| analytics:read | Personal | All | View analytics |
| analytics:write | None | All | Modify analytics |
| users:read | None | All | View users |
| users:write | None | All | Manage users |
| system:read | None | All | System monitoring |
| system:write | None | All | System configuration |

## Data Protection

### Encryption

#### At Rest
- **Database**: MongoDB field-level encryption for sensitive data
- **Files**: Cloudflare R2 server-side encryption
- **Secrets**: AWS KMS or HashiCorp Vault encryption

#### In Transit
- **HTTPS/TLS**: End-to-end encryption for all communications
- **Database Connections**: TLS-enabled MongoDB connections
- **External APIs**: TLS 1.2+ for all external service calls

### Data Sanitization

#### Input Validation
```javascript
// Joi schema validation
const deliverySchema = Joi.object({
  customer_id: Joi.string().required().regex(/^[a-f\d]{24}$/i),
  address: Joi.string().required().min(10).max(500),
  scheduled_time: Joi.date().required().min('now'),
  status: Joi.string().valid('scheduled', 'assigned', 'completed', 'failed')
});
```

#### SQL Injection Prevention
- Parameterized queries in MongoDB
- Input sanitization middleware
- No dynamic query construction

#### XSS Protection
- Content Security Policy (CSP) headers
- Input sanitization for HTML content
- Safe template rendering

## Network Security

### Firewalls & Access Control

#### Application Firewall
```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;

# IP whitelisting
allow 192.168.1.0/24;
allow 10.0.0.0/8;
deny all;
```

#### Database Security
- **Network Isolation**: Database in private subnet
- **IP Whitelisting**: Only application servers can connect
- **TLS Encryption**: Required for all connections
- **Connection Pooling**: Limited connection pool size

### API Security

#### Rate Limiting
```javascript
// Express rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1'
});
```

#### CORS Configuration
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || [
    'https://yourdomain.com',
    'https://app.yourdomain.com'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
```

## Infrastructure Security

### Container Security

#### Docker Best Practices
```dockerfile
# Use specific base images
FROM node:20-alpine

# Don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S delauto -u 1001
USER delauto

# Minimize attack surface
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/*
```

#### Kubernetes Security
```yaml
# Security context
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL

# Network policies
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: delauto-api-policy
spec:
  podSelector:
    matchLabels:
      app: delauto-api
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx
    ports:
    - protocol: TCP
      port: 3000
```

### Secrets Management

#### Environment Variables
- Never commit secrets to version control
- Use `.env` files with `.gitignore`
- Environment-specific secret files

#### AWS Secrets Manager
```javascript
// Retrieve secrets at runtime
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager();

async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({
    SecretId: secretName
  }).promise();
  return JSON.parse(data.SecretString);
}
```

#### HashiCorp Vault
```javascript
// Vault integration
const vault = require('node-vault')({
  endpoint: process.env.VAULT_ENDPOINT,
  token: process.env.VAULT_TOKEN
});

const secrets = await vault.read('secret/delauto/prod');
```

## Monitoring & Auditing

### Security Monitoring

#### Log Analysis
```javascript
// Winston security logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/security.log',
      level: 'warn'
    })
  ]
});

// Log security events
logger.warn('Failed login attempt', {
  ip: req.ip,
  userAgent: req.get('User-Agent'),
  email: req.body.email
});
```

#### Audit Trail
```javascript
// Audit middleware
const auditLog = (action, resource, userId, details) => {
  const auditEntry = {
    timestamp: new Date(),
    action,
    resource,
    userId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    details
  };

  // Store in audit collection
  AuditLog.create(auditEntry);

  // Send to SIEM system
  siemClient.send(auditEntry);
};
```

### Intrusion Detection

#### Failed Login Monitoring
```javascript
// Track failed login attempts
const failedLoginAttempts = new Map();

const trackFailedLogin = (email, ip) => {
  const key = `${email}:${ip}`;
  const attempts = failedLoginAttempts.get(key) || 0;
  failedLoginAttempts.set(key, attempts + 1);

  if (attempts >= 5) {
    // Lock account or alert security team
    securityAlert('Multiple failed login attempts', { email, ip });
  }
};
```

#### Suspicious Activity Detection
- Unusual API call patterns
- Geographic anomalies
- Time-based anomalies
- Volume-based anomalies

## Compliance

### GDPR Compliance

#### Data Subject Rights
- **Right to Access**: Users can request their data
- **Right to Rectification**: Users can update their data
- **Right to Erasure**: Users can request data deletion
- **Data Portability**: Export user data in standard format

#### Implementation
```javascript
// GDPR data export
app.get('/api/gdpr/export/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;

  // Collect all user data
  const userData = {
    profile: await User.findById(userId),
    deliveries: await Delivery.find({ customer_id: userId }),
    callLogs: await CallLog.find({ customer_id: userId }),
    // ... other data
  };

  res.json(userData);
});

// GDPR data deletion
app.delete('/api/gdpr/delete/:userId', authenticateJWT, async (req, res) => {
  const { userId } = req.params;

  // Anonymize or delete user data
  await User.findByIdAndUpdate(userId, { deleted: true });
  await Delivery.updateMany({ customer_id: userId }, { deleted: true });
  // ... cascade deletion

  res.json({ message: 'Data deletion initiated' });
});
```

### SOC 2 Compliance

#### Security Criteria
- **Access Control**: RBAC implementation
- **Change Management**: Version control and deployment procedures
- **Incident Response**: Security incident handling procedures
- **Risk Management**: Regular security assessments

### HIPAA Compliance (Future)

For healthcare integrations:
- **PHI Protection**: Protected Health Information safeguards
- **Audit Controls**: Comprehensive audit logging
- **Access Controls**: Minimum necessary access
- **Transmission Security**: End-to-end encryption

## Security Testing

### Automated Security Testing

#### Dependency Scanning
```bash
# NPM audit
npm audit

# Snyk security scanning
snyk test

# OWASP Dependency Check
dependency-check --project delauto --scan .
```

#### Container Scanning
```bash
# Trivy container scanning
trivy image your-registry/delauto-api:latest

# Clair container vulnerability scanning
klar your-registry/delauto-api:latest
```

### Penetration Testing

#### API Security Testing
```bash
# OWASP ZAP automated scanning
zap.sh -cmd -quickurl https://api.yourdomain.com -quickout zap_report.html

# Postman security testing
newman run security-tests.postman_collection.json
```

#### Infrastructure Testing
```bash
# Nmap port scanning
nmap -sV -p 1-65535 your-server-ip

# SSL/TLS testing
sslscan api.yourdomain.com
testssl.sh api.yourdomain.com
```

## Incident Response

### Security Incident Procedure

1. **Detection**
   - Automated alerts from monitoring systems
   - User reports of suspicious activity
   - Security team monitoring

2. **Assessment**
   - Determine scope and impact
   - Identify affected systems and data
   - Assess business impact

3. **Containment**
   - Isolate affected systems
   - Block malicious traffic
   - Preserve evidence for investigation

4. **Recovery**
   - Restore systems from clean backups
   - Patch vulnerabilities
   - Monitor for reoccurrence

5. **Lessons Learned**
   - Document incident details
   - Update security procedures
   - Implement preventive measures

### Communication Plan

#### Internal Communication
- Security team notification (immediate)
- Management notification (< 1 hour)
- Engineering team notification (< 4 hours)

#### External Communication
- Customer notification (if data breach)
- Regulatory reporting (as required)
- Public disclosure (if necessary)

## Security Best Practices

### Development Security

#### Code Review Checklist
- [ ] Input validation on all user inputs
- [ ] Authentication checks on protected endpoints
- [ ] Authorization checks for role-based access
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Secure headers implementation

#### Secure Coding Guidelines
```javascript
// Avoid insecure patterns
// ✗ Bad: Direct string concatenation in queries
const users = await User.find({ email: req.body.email });

// ✓ Good: Parameterized queries
const users = await User.find({ email: req.body.email }).limit(1);

// ✗ Bad: Storing passwords in plain text
user.password = req.body.password;

// ✓ Good: Hash passwords
user.password = await bcrypt.hash(req.body.password, 12);
```

### Operational Security

#### Access Management
- **Principle of Least Privilege**: Grant minimum required access
- **Regular Access Reviews**: Quarterly access permission reviews
- **Immediate Deprovisioning**: Remove access when employees leave

#### Monitoring & Alerting
- **Real-time Security Monitoring**: 24/7 security event monitoring
- **Automated Alerts**: Immediate notification of security events
- **Regular Security Reports**: Weekly/monthly security summaries

#### Backup & Recovery
- **Encrypted Backups**: All backups encrypted at rest
- **Regular Testing**: Monthly backup restoration testing
- **Secure Storage**: Backups stored in separate secure location

This comprehensive security overview ensures that DelAuto maintains the highest standards of security across all layers of the application, protecting both the system and its users from various threats and vulnerabilities.