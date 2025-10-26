# Authentication Guide

This guide explains the authentication mechanisms used in the DelAuto API.

## Authentication Methods

DelAuto uses two primary authentication methods:

1. **API Key Authentication** - For internal endpoints and external integrations
2. **JWT Bearer Token Authentication** - For user-specific endpoints

## API Key Authentication

### Overview
API keys are used for server-to-server communication and external integrations. They provide access to public endpoints without user context.

### Usage
Include the API key in the `x-api-key` header:

```bash
curl -H "x-api-key: your-api-key" https://api.delauto.com/deliveries
```

### Obtaining API Keys
API keys are provided by the DelAuto team for:
- Third-party integrations
- Mobile applications
- Internal services

### Security Best Practices
- **Never expose API keys in client-side code**
- **Rotate keys regularly** (recommended: every 90 days)
- **Use different keys for different environments**
- **Monitor API key usage** for suspicious activity

### Rate Limiting
API key endpoints are subject to rate limiting:
- **General endpoints**: 1000 requests per 15 minutes
- **Sensitive endpoints**: 100 requests per 15 minutes

## JWT Bearer Token Authentication

### Overview
JWT tokens are used for user-specific operations requiring authentication and authorization. They contain user identity and permissions.

### Token Structure
JWT tokens contain three parts separated by dots:
```
header.payload.signature
```

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "name": "User Name",
  "role": "agent",
  "iat": 1638360000,
  "exp": 1638446400
}
```

### Obtaining Tokens

#### Agent Login
```bash
curl -X POST https://api.delauto.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "agent@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agent": {
    "id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "Agent Smith",
    "email": "agent@example.com",
    "role": "agent"
  }
}
```

### Using Tokens
Include the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  https://api.delauto.com/analytics/dashboard
```

### Token Expiration
- **Default expiration**: 24 hours
- **Refresh mechanism**: Login again to get new token
- **Automatic logout**: Frontend should handle token expiration

### Token Validation
Tokens are validated on each request:
- **Signature verification** using JWT secret
- **Expiration check**
- **User existence verification**
- **Role-based access control**

## Role-Based Access Control (RBAC)

### User Roles

#### Agent Role
- Access to personal delivery assignments
- View personal performance metrics
- Update delivery status
- Limited analytics access

**Permissions:**
- `deliveries:read` (own deliveries)
- `deliveries:update` (assigned deliveries)
- `analytics:read` (personal metrics)

#### Admin Role
- Full system access
- User management
- System configuration
- Complete analytics access

**Permissions:**
- `deliveries:*` (all operations)
- `agents:*` (all operations)
- `analytics:*` (all operations)
- `system:*` (system management)

### Permission Checking
```javascript
// Middleware example
const requireAdmin = (req, res, next) => {
  if (req.agent.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

## Authentication Flow

### Web Application Flow
1. User enters credentials on login page
2. Frontend sends login request to `/api/auth/login`
3. Backend validates credentials and returns JWT token
4. Frontend stores token in localStorage/sessionStorage
5. Subsequent requests include token in Authorization header
6. Backend validates token on each request

### Mobile Application Flow
1. User enters credentials in mobile app
2. App sends login request with device info
3. Backend returns JWT token
4. App stores token securely (Keychain/Keystore)
5. App includes token in API requests
6. Automatic token refresh before expiration

### API Integration Flow
1. Third-party system obtains API key
2. API key is included in `x-api-key` header
3. Backend validates API key
4. Request is processed with appropriate permissions

## Security Features

### Password Security
- **bcrypt hashing** with salt rounds (10)
- **Minimum password requirements**:
  - 8 characters minimum
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
  - At least one special character

### Token Security
- **HS256 algorithm** for signing
- **Secure secret key** (256-bit minimum)
- **Expiration enforcement**
- **No sensitive data** in token payload

### API Key Security
- **Random generation** (32+ characters)
- **Prefix identification** (e.g., `da_live_`, `da_test_`)
- **Environment separation** (live vs test keys)
- **Immediate revocation** capability

## Error Handling

### Authentication Errors

#### Invalid Credentials
```json
{
  "success": false,
  "error": "Invalid credentials",
  "code": "AUTHENTICATION_ERROR"
}
```

#### Token Expired
```json
{
  "success": false,
  "error": "Token expired",
  "code": "TOKEN_EXPIRED"
}
```

#### Insufficient Permissions
```json
{
  "success": false,
  "error": "Admin access required",
  "code": "AUTHORIZATION_ERROR"
}
```

#### Invalid API Key
```json
{
  "success": false,
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

## Best Practices

### Frontend Implementation
```javascript
// Token storage
const setToken = (token) => {
  localStorage.setItem('authToken', token);
};

const getToken = () => {
  return localStorage.getItem('authToken');
};

// API client with automatic token inclusion
const apiClient = axios.create({
  baseURL: 'https://api.delauto.com',
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token refresh on 401 errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login or refresh token
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### Backend Implementation
```javascript
// JWT verification middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.agent = user;
    next();
  });
};

// API key verification middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // Verify API key (implementation depends on storage method)
  const isValidKey = verifyApiKey(apiKey);
  if (!isValidKey) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};
```

### Security Headers
```javascript
// Helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

## Testing Authentication

### Unit Tests
```javascript
describe('Authentication', () => {
  test('should authenticate valid JWT token', async () => {
    const token = jwt.sign({ id: 'user123', role: 'agent' }, 'secret');

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  test('should reject invalid API key', async () => {
    const response = await request(app)
      .get('/api/deliveries')
      .set('x-api-key', 'invalid-key');

    expect(response.status).toBe(401);
  });
});
```

### Integration Tests
```javascript
describe('Authentication Flow', () => {
  test('complete login flow', async () => {
    // Register user
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Agent',
        email: 'test@example.com',
        password: 'password123',
        phone: '+1234567890'
      });

    // Login
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.token).toBeDefined();

    // Use token for authenticated request
    const protectedResponse = await request(app)
      .get('/api/analytics/dashboard')
      .set('Authorization', `Bearer ${loginResponse.body.token}`);

    expect(protectedResponse.status).toBe(200);
  });
});
```

## Troubleshooting

### Common Issues

#### Token Not Working
- Check token expiration
- Verify correct header format: `Bearer <token>`
- Ensure token wasn't truncated

#### API Key Rejected
- Verify key format and prefix
- Check if key was revoked
- Confirm correct environment (live vs test)

#### CORS Issues
- Ensure correct origin in CORS configuration
- Check preflight request handling

#### Rate Limiting
- Monitor request frequency
- Implement exponential backoff
- Consider upgrading rate limits

### Debug Mode
Enable debug logging for authentication issues:
```bash
DEBUG=delauto:auth npm start
```

## Migration Guide

### From API Keys to JWT
If migrating from API key-only authentication:

1. **Update client applications** to handle JWT tokens
2. **Implement login endpoints** for user authentication
3. **Add token refresh mechanisms**
4. **Update middleware** to support both methods during transition
5. **Gradually phase out** API key usage

### Multi-Factor Authentication (Future)
Planned MFA implementation:
- SMS-based verification
- TOTP (Time-based One-Time Password)
- Hardware security keys

## Support

For authentication issues:
- **Check status page** for service outages
- **Review API documentation** for correct usage
- **Contact support** with token/API key details (redacted)
- **Use debug endpoints** for troubleshooting

---

**Version:** 1.0.0
**Last Updated:** October 2025