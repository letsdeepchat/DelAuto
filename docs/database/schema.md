# Database Schema

This document describes the MongoDB database schema used in the DelAuto system.

## Overview

DelAuto uses MongoDB as its primary database, with Mongoose ODM for schema definition and data validation. The database is designed for high-performance delivery operations with optimized queries and aggregations.

## Database Configuration

```javascript
// Connection configuration
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/delauto', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});
```

## Core Collections

### 1. Agents Collection

**Purpose:** Store delivery agent information and authentication data

**Schema Definition:**
```javascript
const agentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['agent', 'admin'], default: 'agent' },
    active_deliveries: { type: Number, default: 0 },
    current_location: mongoose.Schema.Types.Mixed, // GeoJSON or coordinates
    is_active: { type: Boolean, default: true },
    push_subscription: mongoose.Schema.Types.Mixed, // Web Push API subscription
    last_login: { type: Date },
    login_count: { type: Number, default: 0 },
    performance_metrics: {
      total_deliveries: { type: Number, default: 0 },
      successful_deliveries: { type: Number, default: 0 },
      average_rating: { type: Number, default: 0 },
      response_time: { type: Number, default: 0 }, // minutes
    },
  },
  { timestamps: true },
);
```

**Indexes:**
```javascript
// Performance indexes
agentSchema.index({ email: 1 }, { unique: true });
agentSchema.index({ phone: 1 }, { unique: true });
agentSchema.index({ role: 1 });
agentSchema.index({ is_active: 1 });
agentSchema.index({ 'performance_metrics.total_deliveries': -1 });

// Geospatial index for location-based queries
agentSchema.index({ current_location: '2dsphere' });
```

**Sample Document:**
```json
{
  "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
  "name": "Agent Smith",
  "phone": "+1234567890",
  "email": "agent.smith@delauto.com",
  "password": "$2a$10$encryptedpasswordhash",
  "role": "agent",
  "active_deliveries": 3,
  "current_location": {
    "type": "Point",
    "coordinates": [-74.006, 40.7128]
  },
  "is_active": true,
  "push_subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "auth": "auth_key",
      "p256dh": "p256dh_key"
    }
  },
  "performance_metrics": {
    "total_deliveries": 245,
    "successful_deliveries": 238,
    "average_rating": 4.7,
    "response_time": 12
  },
  "createdAt": "2025-01-15T08:00:00.000Z",
  "updatedAt": "2025-10-26T12:00:00.000Z"
}
```

### 2. Customers Collection

**Purpose:** Store customer contact information and delivery preferences

**Schema Definition:**
```javascript
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String },
    address: { type: String },
    preferences: {
      preferred_times: [String], // e.g., ["09:00-12:00", "14:00-17:00"]
      preferred_days: [String], // e.g., ["monday", "tuesday", "wednesday"]
      delivery_instructions: { type: String },
      contact_method: { type: String, enum: ['call', 'sms', 'both'], default: 'call' },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'America/New_York' },
    },
    call_history: [{
      call_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CallLog' },
      timestamp: { type: Date },
      status: { type: String },
      duration: { type: Number },
    }],
    total_deliveries: { type: Number, default: 0 },
    successful_deliveries: { type: Number, default: 0 },
    last_delivery_date: { type: Date },
    customer_rating: { type: Number, min: 1, max: 5 },
  },
  { timestamps: true },
);
```

**Indexes:**
```javascript
customerSchema.index({ phone: 1 }, { unique: true });
customerSchema.index({ email: 1 });
customerSchema.index({ 'preferences.preferred_days': 1 });
customerSchema.index({ total_deliveries: -1 });
customerSchema.index({ last_delivery_date: -1 });
```

**Sample Document:**
```json
{
  "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
  "name": "John Doe",
  "phone": "+1234567891",
  "email": "john.doe@example.com",
  "address": "123 Main St, City, State 12345",
  "preferences": {
    "preferred_times": ["09:00-12:00", "14:00-17:00"],
    "preferred_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "delivery_instructions": "Leave at front door if no answer",
    "contact_method": "call",
    "language": "en",
    "timezone": "America/New_York"
  },
  "call_history": [
    {
      "call_id": "64f1a2b3c4d5e6f7g8h9i0j5",
      "timestamp": "2025-10-26T14:30:00.000Z",
      "status": "completed",
      "duration": 45
    }
  ],
  "total_deliveries": 12,
  "successful_deliveries": 11,
  "last_delivery_date": "2025-10-25T16:00:00.000Z",
  "customer_rating": 4.5,
  "createdAt": "2025-03-10T09:00:00.000Z",
  "updatedAt": "2025-10-26T14:30:00.000Z"
}
```

### 3. Deliveries Collection

**Purpose:** Store delivery scheduling and status information

**Schema Definition:**
```javascript
const deliverySchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
    },
    address: { type: String, required: true },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
    },
    scheduled_time: { type: Date, required: true },
    estimated_duration: { type: Number, default: 30 }, // minutes
    status: {
      type: String,
      enum: ['scheduled', 'assigned', 'in_transit', 'completed', 'failed', 'cancelled'],
      default: 'scheduled',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    package_details: {
      weight: { type: Number }, // kg
      dimensions: {
        length: { type: Number },
        width: { type: Number },
        height: { type: Number },
      },
      value: { type: Number }, // monetary value
      fragile: { type: Boolean, default: false },
      signature_required: { type: Boolean, default: false },
      special_instructions: { type: String },
    },
    call_log_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CallLog' },
    recording_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Recording' },
    tracking_events: [{
      status: { type: String },
      timestamp: { type: Date, default: Date.now },
      location: mongoose.Schema.Types.Mixed,
      notes: { type: String },
    }],
    actual_delivery_time: { type: Date },
    customer_feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comments: { type: String },
    },
    retry_count: { type: Number, default: 0 },
    max_retries: { type: Number, default: 3 },
  },
  { timestamps: true },
);
```

**Indexes:**
```javascript
deliverySchema.index({ customer_id: 1 });
deliverySchema.index({ agent_id: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ scheduled_time: 1 });
deliverySchema.index({ priority: -1 });
deliverySchema.index({ coordinates: '2dsphere' });
deliverySchema.index({ 'package_details.fragile': 1 });
deliverySchema.index({ createdAt: -1 });
```

**Sample Document:**
```json
{
  "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
  "customer_id": "64f1a2b3c4d5e6f7g8h9i0j2",
  "agent_id": "64f1a2b3c4d5e6f7g8h9i0j3",
  "address": "123 Main St, City, State 12345",
  "coordinates": {
    "type": "Point",
    "coordinates": [-74.006, 40.7128]
  },
  "scheduled_time": "2025-10-26T14:00:00.000Z",
  "estimated_duration": 30,
  "status": "completed",
  "priority": "normal",
  "package_details": {
    "weight": 2.5,
    "dimensions": {
      "length": 30,
      "width": 20,
      "height": 10
    },
    "value": 150.00,
    "fragile": false,
    "signature_required": true,
    "special_instructions": "Handle with care"
  },
  "call_log_id": "64f1a2b3c4d5e6f7g8h9i0j5",
  "recording_id": "64f1a2b3c4d5e6f7g8h9i0j4",
  "tracking_events": [
    {
      "status": "assigned",
      "timestamp": "2025-10-26T13:00:00.000Z",
      "notes": "Assigned to Agent Smith"
    },
    {
      "status": "in_transit",
      "timestamp": "2025-10-26T13:30:00.000Z",
      "location": { "type": "Point", "coordinates": [-74.006, 40.7128] }
    },
    {
      "status": "completed",
      "timestamp": "2025-10-26T14:15:00.000Z",
      "notes": "Delivered successfully"
    }
  ],
  "actual_delivery_time": "2025-10-26T14:15:00.000Z",
  "customer_feedback": {
    "rating": 5,
    "comments": "Excellent service!"
  },
  "retry_count": 0,
  "max_retries": 3,
  "createdAt": "2025-10-25T10:00:00.000Z",
  "updatedAt": "2025-10-26T14:15:00.000Z"
}
```

### 4. Call Logs Collection

**Purpose:** Store detailed records of all voice calls made to customers

**Schema Definition:**
```javascript
const callLogSchema = new mongoose.Schema(
  {
    delivery_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
    },
    call_sid: { type: String, required: true, unique: true }, // Twilio SID
    status: {
      type: String,
      enum: ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled'],
      required: true,
    },
    from_number: { type: String, required: true },
    to_number: { type: String, required: true },
    direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
    start_time: { type: Date },
    end_time: { type: Date },
    duration: { type: Number }, // seconds
    recording_url: { type: String },
    recording_duration: { type: Number },
    transcription: { type: String },
    ai_analysis: {
      sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
      keywords: [String],
      instructions: { type: String },
      priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'] },
      confidence_score: { type: Number, min: 0, max: 1 },
    },
    error_code: { type: String },
    error_message: { type: String },
    retry_count: { type: Number, default: 0 },
    webhook_events: [{
      event: { type: String },
      timestamp: { type: Date, default: Date.now },
      data: mongoose.Schema.Types.Mixed,
    }],
  },
  { timestamps: true },
);
```

**Indexes:**
```javascript
callLogSchema.index({ delivery_id: 1 });
callLogSchema.index({ call_sid: 1 }, { unique: true });
callLogSchema.index({ status: 1 });
callLogSchema.index({ start_time: 1 });
callLogSchema.index({ 'ai_analysis.sentiment': 1 });
callLogSchema.index({ createdAt: -1 });
```

### 5. Recordings Collection

**Purpose:** Store audio recording metadata and processing results

**Schema Definition:**
```javascript
const recordingSchema = new mongoose.Schema(
  {
    call_log_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CallLog',
      required: true,
    },
    delivery_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      required: true,
    },
    audio_url: { type: String, required: true }, // Cloudflare R2 URL
    duration: { type: Number, required: true }, // seconds
    file_size: { type: Number }, // bytes
    format: { type: String, default: 'mp3' },
    transcription: {
      text: { type: String },
      confidence: { type: Number, min: 0, max: 1 },
      language: { type: String, default: 'en' },
      processing_time: { type: Number }, // seconds
    },
    ai_analysis: {
      sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
      keywords: [String],
      instructions: { type: String },
      priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'] },
      entities: [{
        type: { type: String }, // person, location, time, etc.
        value: { type: String },
        confidence: { type: Number },
      }],
      summary: { type: String },
    },
    processing_status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    processing_attempts: { type: Number, default: 0 },
    last_processed_at: { type: Date },
    error_message: { type: String },
    access_count: { type: Number, default: 0 },
    last_accessed_at: { type: Date },
  },
  { timestamps: true },
);
```

**Indexes:**
```javascript
recordingSchema.index({ call_log_id: 1 }, { unique: true });
recordingSchema.index({ delivery_id: 1 });
recordingSchema.index({ processing_status: 1 });
recordingSchema.index({ 'transcription.confidence': -1 });
recordingSchema.index({ createdAt: -1 });
```

## Supporting Collections

### 6. API Keys Collection

**Purpose:** Store API keys for external integrations

```javascript
const apiKeySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    environment: { type: String, enum: ['development', 'staging', 'production'], default: 'development' },
    permissions: [String], // e.g., ['deliveries:read', 'deliveries:write']
    rate_limit: {
      requests: { type: Number, default: 1000 },
      period: { type: Number, default: 900000 }, // 15 minutes in ms
    },
    is_active: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
    last_used_at: { type: Date },
    usage_count: { type: Number, default: 0 },
  },
  { timestamps: true },
);
```

### 7. System Metrics Collection

**Purpose:** Store system performance and analytics data

```javascript
const systemMetricsSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    metric_type: { type: String, required: true }, // e.g., 'api_response_time', 'call_success_rate'
    value: { type: Number, required: true },
    unit: { type: String }, // e.g., 'ms', 'percentage', 'count'
    tags: mongoose.Schema.Types.Mixed, // Additional metadata
    source: { type: String, default: 'application' }, // application, twilio, redis, etc.
  },
  { timestamps: false },
);

// Time-series optimized indexes
systemMetricsSchema.index({ timestamp: -1 });
systemMetricsSchema.index({ metric_type: 1, timestamp: -1 });
systemMetricsSchema.index({ source: 1, timestamp: -1 });
```

## Database Relationships

```
Customers (1) ──── (N) Deliveries
    │                      │
    │                      │
    └── (1) Call Logs ─────┘
              │
              │
              └── (1) Recordings
                     │
                     │
                     └── (1) AI Analysis

Agents (1) ──── (N) Deliveries

API Keys (1) ──── (N) Requests (tracked via metrics)
```

## Data Migration Strategy

### Migration Scripts
Located in `src/database/migrations/`

```javascript
// Example migration: Add priority field to deliveries
module.exports = {
  async up(db) {
    await db.collection('deliveries').updateMany(
      { priority: { $exists: false } },
      { $set: { priority: 'normal' } }
    );
  },

  async down(db) {
    await db.collection('deliveries').updateMany(
      {},
      { $unset: { priority: 1 } }
    );
  },
};
```

### Migration Commands
```bash
# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create add_delivery_priority

# Rollback last migration
npm run migrate:down
```

## Performance Optimizations

### Indexing Strategy
- **Compound indexes** for common query patterns
- **Partial indexes** for filtered queries
- **TTL indexes** for temporary data
- **Geospatial indexes** for location-based queries

### Aggregation Pipelines
Common aggregation patterns for analytics:

```javascript
// Delivery success rate by agent
{
  $match: { status: { $in: ['completed', 'failed'] } }
},
{
  $group: {
    _id: '$agent_id',
    total: { $sum: 1 },
    successful: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
  }
},
{
  $project: {
    successRate: { $multiply: [{ $divide: ['$successful', '$total'] }, 100] }
  }
}
```

### Caching Strategy
- **Redis** for frequently accessed data
- **Application-level caching** for computed results
- **Database query result caching**

## Backup and Recovery

### Backup Strategy
- **Daily automated backups** using MongoDB Atlas or mongodump
- **Point-in-time recovery** capability
- **Cross-region replication** for disaster recovery
- **Encrypted backups** for security

### Recovery Procedures
1. **Identify backup point** closest to incident
2. **Restore to staging environment** first
3. **Validate data integrity** before production restore
4. **Update application configurations** if needed
5. **Monitor system performance** post-recovery

## Monitoring and Maintenance

### Database Health Checks
- **Connection pool monitoring**
- **Query performance analysis**
- **Index usage statistics**
- **Storage utilization tracking**

### Maintenance Tasks
- **Index optimization** based on query patterns
- **Data archiving** for old records
- **Statistics collection** updates
- **Replica set health** monitoring

## Security Considerations

### Data Encryption
- **At-rest encryption** using MongoDB Enterprise
- **In-transit encryption** via TLS
- **Field-level encryption** for sensitive data

### Access Control
- **Role-based access** at database level
- **IP whitelisting** for production access
- **Audit logging** for all operations

### Data Retention
- **Configurable retention policies** per collection
- **Automated data purging** for compliance
- **Archival procedures** for historical data

This schema provides a solid foundation for the DelAuto system, supporting both current operational needs and future scalability requirements while maintaining data integrity and performance.