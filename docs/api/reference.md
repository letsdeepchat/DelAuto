# API Reference

This document provides comprehensive documentation for the DelAuto Delivery Automation System API.

## Base URL

```
Production: https://your-domain.com/api
Development: http://localhost:3000/api
```

## Authentication

### API Key Authentication
Used for internal endpoints and external integrations.

```bash
curl -H "x-api-key: your-api-key" https://your-domain.com/api/deliveries
```

### JWT Bearer Token Authentication
Used for user-specific endpoints (agents, admins).

```bash
curl -H "Authorization: Bearer your-jwt-token" https://your-domain.com/api/analytics/dashboard
```

## Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Core Endpoints

### Deliveries API

#### GET /api/deliveries
Get all deliveries with optional filtering.

**Authentication:** API Key
**Query Parameters:**
- `status` (string): Filter by delivery status
- `agent_id` (string): Filter by agent ID
- `start_date` (ISO date): Filter deliveries from this date
- `end_date` (ISO date): Filter deliveries until this date
- `limit` (number): Maximum number of results (default: 50)
- `offset` (number): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "customer_id": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
        "name": "John Doe",
        "phone": "+1234567890"
      },
      "agent_id": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
        "name": "Agent Smith",
        "phone": "+1234567891"
      },
      "address": "123 Main St, City, State 12345",
      "scheduled_time": "2025-10-26T14:00:00.000Z",
      "status": "scheduled",
      "created_at": "2025-10-25T10:00:00.000Z",
      "updated_at": "2025-10-25T10:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### GET /api/deliveries/:id
Get a specific delivery by ID.

**Authentication:** API Key
**Path Parameters:**
- `id` (string, required): Delivery ID

**Response:** Single delivery object as shown above.

#### POST /api/deliveries
Create a new delivery.

**Authentication:** API Key
**Request Body:**
```json
{
  "customer_id": "64f1a2b3c4d5e6f7g8h9i0j2",
  "agent_id": "64f1a2b3c4d5e6f7g8h9i0j3",
  "address": "123 Main St, City, State 12345",
  "scheduled_time": "2025-10-26T14:00:00.000Z"
}
```

**Response:** Created delivery object.

#### PUT /api/deliveries/:id
Update an existing delivery.

**Authentication:** API Key
**Path Parameters:**
- `id` (string, required): Delivery ID

**Request Body:** Same as POST, all fields optional.

#### DELETE /api/deliveries/:id
Delete a delivery.

**Authentication:** API Key
**Path Parameters:**
- `id` (string, required): Delivery ID

### Calls API

#### POST /api/calls/initiate
Queue a customer call for a delivery.

**Authentication:** API Key
**Request Body:**
```json
{
  "delivery_id": "64f1a2b3c4d5e6f7g8h9i0j1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call queued successfully",
  "job_id": "call_64f1a2b3c4d5e6f7g8h9i0j1"
}
```

### Recordings API

#### GET /api/recordings/:id
Get recording details and audio URL.

**Authentication:** API Key
**Path Parameters:**
- `id` (string, required): Recording ID

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j4",
    "call_log_id": "64f1a2b3c4d5e6f7g8h9i0j5",
    "audio_url": "https://storage.example.com/recordings/recording.mp3",
    "transcription": "Hello, I will be available between 2 and 4 PM today. Please leave the package at the front door.",
    "duration": 45,
    "created_at": "2025-10-26T12:00:00.000Z"
  }
}
```

## Authentication API

### POST /api/auth/login
Authenticate an agent and receive JWT token.

**Authentication:** None required
**Request Body:**
```json
{
  "email": "agent@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "agent": {
    "id": "64f1a2b3c4d5e6f7g8h9i0j3",
    "name": "Agent Smith",
    "email": "agent@example.com",
    "role": "agent",
    "phone": "+1234567891"
  }
}
```

### POST /api/auth/register
Register a new agent (admin only, for testing).

**Authentication:** None required (admin use only)
**Request Body:**
```json
{
  "name": "New Agent",
  "email": "newagent@example.com",
  "password": "securepassword",
  "phone": "+1234567892",
  "role": "agent"
}
```

## Analytics API

### GET /api/analytics/dashboard
Get comprehensive dashboard analytics.

**Authentication:** JWT (Admin only)
**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalDeliveries": 1250,
      "totalCalls": 1180,
      "activeAgents": 15,
      "completionRate": 87.5,
      "callSuccessRate": 92.3
    },
    "trends": [
      {
        "date": "2025-10-20",
        "deliveries": 45,
        "calls": 42,
        "completed": 38
      }
    ],
    "performance": {
      "agentPerformance": [...],
      "callMetrics": {...},
      "systemHealth": {...}
    }
  }
}
```

### GET /api/analytics/agent-performance
Get agent performance metrics with pagination.

**Authentication:** JWT (Admin only)
**Query Parameters:**
- `startDate` (ISO date): Start date for filtering
- `endDate` (ISO date): End date for filtering
- `page` (number): Page number (default: 1)
- `limit` (number): Results per page (default: 10, max: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "agentId": "64f1a2b3c4d5e6f7g8h9i0j3",
        "agentName": "Agent Smith",
        "deliveriesCompleted": 45,
        "averageDeliveryTime": 28,
        "successRate": 93.3,
        "totalCalls": 48,
        "callSuccessRate": 95.8
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "pages": 2
    }
  }
}
```

### GET /api/analytics/timeseries/:metric
Get time-series data for charts.

**Authentication:** JWT (Admin only)
**Path Parameters:**
- `metric` (string, required): "deliveries" or "calls"

**Query Parameters:**
- `startDate` (ISO date): Start date for data
- `endDate` (ISO date): End date for data

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-10-20",
      "count": 45,
      "successful": 38,
      "failed": 7
    },
    {
      "date": "2025-10-21",
      "count": 52,
      "successful": 46,
      "failed": 6
    }
  ]
}
```

### POST /api/analytics/ai/process-recording
Process a recording with AI for transcription and analysis.

**Authentication:** JWT (Admin only)
**Request Body:**
```json
{
  "recordingUrl": "https://storage.example.com/recordings/recording.mp3",
  "recordingId": "64f1a2b3c4d5e6f7g8h9i0j4"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "recordingId": "64f1a2b3c4d5e6f7g8h9i0j4",
    "transcription": "Hello, I will be available between 2 and 4 PM today...",
    "sentiment": "positive",
    "keywords": ["available", "2-4 PM", "front door"],
    "instructions": "Leave package at front door between 2-4 PM",
    "priority": "normal",
    "processingTime": 2.3
  }
}
```

## Routing API

### POST /api/routing/assign-agent
Smart agent assignment based on delivery complexity.

**Authentication:** JWT (Admin only)
**Request Body:**
```json
{
  "deliveryId": "64f1a2b3c4d5e6f7g8h9i0j1",
  "availableAgentIds": ["64f1a2b3c4d5e6f7g8h9i0j3", "64f1a2b3c4d5e6f7g8h9i0j6"],
  "instructions": "Fragile package, signature required",
  "transcription": "Please handle with care, needs signature",
  "priority": "high"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "agent": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "name": "Agent Smith"
    },
    "score": 87.5,
    "reasoning": "Score: 87.5 | Factors: Success Rate: 93.30%, General Performance: 93.30%, Speed: +12.5",
    "alternatives": [
      {
        "agent": { "_id": "64f1a2b3c4d5e6f7g8h9i0j6", "name": "Agent Jones" },
        "score": 82.1,
        "reasoning": "Alternative option with good performance"
      }
    ],
    "complexity": {
      "score": 3,
      "level": "medium"
    }
  }
}
```

### POST /api/routing/optimal-call-timing
Calculate optimal call timing based on geolocation and preferences.

**Authentication:** JWT (Admin only)
**Request Body:**
```json
{
  "deliveryId": "64f1a2b3c4d5e6f7g8h9i0j1",
  "customerId": "64f1a2b3c4d5e6f7g8h9i0j2",
  "customerTimezone": "America/New_York"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "optimalTimes": [
      {
        "datetime": "2025-10-26T18:00:00.000Z",
        "localHour": 14,
        "dayOfWeek": 1,
        "score": 85,
        "reasoning": "Monday at 14:00, Customer preferred hour, Customer preferred day"
      }
    ],
    "customerTimezone": "America/New_York",
    "alternatives": [
      {
        "datetime": "2025-10-26T19:00:00.000Z",
        "reasoning": "1 hour later as alternative"
      }
    ]
  }
}
```

### POST /api/routing/learn-customer-preferences
Learn and update customer call preferences from call results.

**Authentication:** JWT (Admin only)
**Request Body:**
```json
{
  "customerId": "64f1a2b3c4d5e6f7g8h9i0j2",
  "callResult": {
    "status": "completed",
    "duration": 35,
    "timestamp": "2025-10-26T18:00:00.000Z"
  }
}
```

### POST /api/routing/ai/voice-authenticate
Voice authentication using AI-powered speaker verification.

**Authentication:** JWT (Admin only)
**Request Body:**
```json
{
  "audioUrl": "https://storage.example.com/recordings/auth_sample.mp3",
  "profileId": "voice_profile_64f1a2b3c4d5e6f7g8h9i0j2"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authenticated": true,
    "confidence": 94.7,
    "profileId": "voice_profile_64f1a2b3c4d5e6f7g8h9i0j2",
    "method": "speaker_verification",
    "timestamp": "2025-10-26T12:00:00.000Z",
    "note": "High confidence match"
  }
}
```

## Webhooks API

### POST /api/webhooks/voice
Handle Twilio voice call webhooks.

**Authentication:** None (Twilio signature validation)
**Request Body:** Twilio webhook payload

### POST /api/webhooks/call-status
Handle Twilio call status update webhooks.

**Authentication:** None (Twilio signature validation)
**Request Body:** Twilio call status payload

### POST /api/webhooks/recording
Handle Twilio recording completion webhooks.

**Authentication:** None (Twilio signature validation)
**Request Body:** Twilio recording payload

## Push Notifications API

### POST /api/push/subscribe
Subscribe to push notifications.

**Authentication:** JWT
**Request Body:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "auth": "auth_key",
      "p256dh": "p256dh_key"
    }
  }
}
```

### POST /api/push/unsubscribe
Unsubscribe from push notifications.

**Authentication:** JWT
**Request Body:**
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

## Admin API

### GET /api/admin/dashboard
Get comprehensive system overview.

**Authentication:** JWT (Admin only)
**Response:** Detailed system metrics and status.

### GET /api/admin/deliveries
Get paginated delivery management data.

**Authentication:** JWT (Admin only)
**Query Parameters:** Standard pagination and filtering.

### GET /api/admin/agents
Get agent management data.

**Authentication:** JWT (Admin only)

### GET /api/admin/system-health
Get system health and monitoring data.

**Authentication:** JWT (Admin only)

## Mobile API

### GET /api/mobile/dashboard
Get mobile-optimized dashboard.

**Authentication:** API Key
**Response:** Simplified dashboard data for mobile apps.

### GET /api/mobile/deliveries
Get agent's assigned deliveries.

**Authentication:** API Key
**Query Parameters:**
- `agent_id` (string, required): Agent ID

### PUT /api/mobile/deliveries/:id/status
Update delivery status.

**Authentication:** API Key
**Request Body:**
```json
{
  "status": "completed",
  "notes": "Delivered successfully to front door"
}
```

## Monitoring API

### GET /health
Get system health check.

**Authentication:** None
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T12:00:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "twilio": "healthy"
  },
  "metrics": {
    "uptime": "99.9%",
    "responseTime": "45ms"
  }
}
```

### GET /metrics
Get detailed system metrics.

**Authentication:** None (restricted in production)
**Response:** Comprehensive system performance metrics.

## Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `AUTHENTICATION_ERROR` | Invalid credentials |
| `AUTHORIZATION_ERROR` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `CONFLICT` | Resource conflict |
| `EXTERNAL_API_ERROR` | External service error |
| `INTERNAL_ERROR` | Internal server error |

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 requests | 15 minutes |
| Admin endpoints | 100 requests | 15 minutes |
| Analytics endpoints | 50 requests | 15 minutes |
| General API | 1000 requests | 15 minutes |

## SDKs and Libraries

### JavaScript/Node.js
```javascript
const delAuto = require('delauto-sdk');

const client = new delAuto.Client({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-domain.com/api'
});

// Create delivery
const delivery = await client.deliveries.create({
  customer_id: 'customer_123',
  address: '123 Main St',
  scheduled_time: '2025-10-26T14:00:00Z'
});
```

### Python
```python
from delauto import DelAuto

client = DelAuto(api_key='your-api-key')

# Get deliveries
deliveries = client.deliveries.list(status='scheduled')
```

### cURL Examples

**Create Delivery:**
```bash
curl -X POST https://your-domain.com/api/deliveries \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "customer_id": "64f1a2b3c4d5e6f7g8h9i0j2",
    "address": "123 Main St, City, State 12345",
    "scheduled_time": "2025-10-26T14:00:00.000Z"
  }'
```

**Get Analytics Dashboard:**
```bash
curl -X GET https://your-domain.com/api/analytics/dashboard \
  -H "Authorization: Bearer your-jwt-token"
```

## Versioning

API versioning follows semantic versioning:
- **v1.0.0**: Initial release with core functionality
- **v1.1.0**: Added AI analytics features
- **v1.2.0**: Enhanced routing and mobile APIs

## Support

For API support and questions:
- **Documentation**: [docs.delauto.com](https://docs.delauto.com)
- **Status Page**: [status.delauto.com](https://status.delauto.com)
- **Developer Forum**: [forum.delauto.com](https://forum.delauto.com)
- **Email Support**: api-support@delauto.com

---

**API Version:** v1.2.0
**Last Updated:** October 2025