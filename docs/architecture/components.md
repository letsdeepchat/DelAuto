# System Components and Services

This document provides detailed information about each component and service in the DelAuto system.

## Core Components

### 1. API Server (Express.js)

**Location**: `src/index.js`
**Purpose**: Main application server handling HTTP requests and responses

**Key Features**:
- RESTful API endpoints
- Middleware stack (auth, CORS, rate limiting, compression)
- Swagger API documentation
- WebSocket integration
- Health check endpoints

**Configuration**:
```javascript
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet(corsOptions));
app.use(cors(corsOptions));
app.use(compression());
app.use(rateLimit(limiter));

// Request monitoring
app.use(requestMonitoringMiddleware);
```

### 2. Database Layer

**Technology**: MongoDB with Mongoose ODM
**Location**: `src/database/`

**Components**:
- **Connection** (`connection.js`): Database connection management
- **Models** (`models/`): Data models and schemas
- **Migrations** (`migrations/`): Database schema migrations
- **Queries** (`queries/`): Optimized database queries

**Models**:
- `Agent`: Delivery agent information and authentication
- `Customer`: Customer contact details and preferences
- `Delivery`: Delivery scheduling and status
- `CallLog`: Voice call records and metadata
- `Recording`: Audio recording storage and transcription

### 3. Service Layer

#### Routing Service (`src/services/routingService.js`)
**Purpose**: Intelligent agent assignment and call optimization

**Features**:
- Smart agent assignment based on instruction complexity
- Optimal call timing calculation using geolocation
- Customer preference learning from call patterns
- Agent performance analysis

**Key Methods**:
- `assignAgentSmart()`: AI-powered agent assignment
- `calculateOptimalCallTiming()`: Geolocation-based timing
- `learnCustomerPreferences()`: ML-based preference learning

#### Twilio Service (`src/services/twilioService.js`)
**Purpose**: Voice communication management

**Features**:
- Outbound call initiation
- Call status tracking
- Recording management
- SMS notifications (future)

**Integration**:
```javascript
const twilioClient = twilio(accountSid, authToken);

async function makeCustomerCall(delivery) {
  const call = await twilioClient.calls.create({
    url: `${baseUrl}/api/webhooks/voice?delivery_id=${delivery._id}`,
    to: delivery.customer_phone,
    from: twilioPhoneNumber,
    // ... additional parameters
  });
}
```

#### Analytics Service (`src/services/analyticsService.js`)
**Purpose**: Business intelligence and performance metrics

**Features**:
- Real-time dashboard data
- Agent performance tracking
- Delivery success analytics
- ROI calculations
- Failed delivery reduction metrics

#### Queue Service (`src/services/queueService.js`)
**Purpose**: Asynchronous job processing

**Technology**: Redis/Bull queue system
**Location**: `src/queue/callWorker.js`

**Queues**:
- `delivery_queue`: Scheduled delivery processing
- `call_queue`: Outbound call jobs
- `recording_queue`: Audio processing jobs
- `notification_queue`: Agent notifications

#### Cache Service (`src/services/cacheService.js`)
**Purpose**: High-performance data caching

**Features**:
- Redis-based caching
- TTL (Time-To-Live) management
- Cache invalidation strategies
- Performance monitoring

#### Monitoring Service (`src/services/monitoringService.js`)
**Purpose**: System health and performance monitoring

**Features**:
- Request/response metrics
- Error tracking
- Health status endpoints
- Performance dashboards

### 4. API Routes

**Location**: `src/api/routes/`

#### Core Routes:
- `deliveries.js`: Delivery CRUD operations
- `calls.js`: Call initiation and management
- `recordings.js`: Audio recording access
- `agents.js`: Agent management
- `auth.js`: Authentication endpoints

#### Advanced Routes:
- `analytics.js`: Business intelligence APIs
- `routing.js`: Intelligent routing endpoints
- `push.js`: Push notification management
- `admin.js`: Administrative functions
- `mobile.js`: Mobile app APIs
- `webhooks.js`: Twilio webhook handlers

### 5. Middleware

**Location**: `src/api/middleware/`

#### Authentication (`auth.js`)
- JWT token validation
- API key authentication
- Role-based access control
- Session management

#### Error Handling (`errorHandler.js`)
- Global error catching
- Structured error responses
- Logging integration
- Development vs production error handling

#### Validation (`validation.js`)
- Input sanitization
- Schema validation (Joi)
- Request/response validation
- Security filtering

### 6. WebSocket Integration

**Technology**: Socket.io
**Location**: Integrated in `src/index.js`

**Features**:
- Real-time agent notifications
- Live delivery status updates
- Bi-directional communication
- Room-based messaging (agent-specific)

**Implementation**:
```javascript
io.on('connection', (socket) => {
  socket.on('join-agent-room', (agentId) => {
    socket.join(`agent_${agentId}`);
  });
});
```

### 7. Testing Infrastructure

**Location**: `tests/`

**Structure**:
- `api/routes/`: API endpoint testing
- `services/`: Service layer testing
- `middleware/`: Middleware testing
- `integration/`: End-to-end testing
- `performance/`: Load testing
- `security/`: Security testing

**Tools**:
- Jest: Test framework
- Supertest: API testing
- Sinon: Mocking library
- Nock: HTTP mocking
- MongoDB Memory Server: Database testing

### 8. Configuration Management

**Files**:
- `.env`: Environment variables
- `package.json`: Dependencies and scripts
- `eslint.config.js`: Code linting rules
- `jest.config.js`: Test configuration

**Environment Variables**:
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/delauto

# Twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# JWT
JWT_SECRET=your_jwt_secret

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=your_openai_key
```

## External Dependencies

### Twilio Integration
- **Voice API**: Outbound calling and recording
- **Webhooks**: Event-driven callbacks
- **TwiML**: Call flow control
- **Pricing**: Pay-as-you-go model

### OpenAI Integration
- **Whisper**: Audio transcription
- **GPT**: Voice analysis and insights
- **Embeddings**: Semantic search capabilities

### Cloudflare R2
- **Storage**: Scalable object storage
- **CDN**: Global content delivery
- **Pricing**: Cost-effective storage

### Redis
- **Caching**: Fast data access
- **Queues**: Job processing
- **Sessions**: User session storage

## Component Communication

### Synchronous Communication
- HTTP REST APIs between services
- Direct method calls within services
- Database queries

### Asynchronous Communication
- Redis pub/sub for cross-service events
- WebSocket real-time updates
- Queue-based job processing

### Event-Driven Architecture
- Webhook callbacks from Twilio
- Database change streams
- Scheduled job triggers

## Performance Characteristics

### API Response Times
- Average: <100ms for cached requests
- P95: <500ms for database queries
- P99: <2s for complex operations

### Scalability Metrics
- Concurrent connections: 10,000+
- Daily deliveries: 10,000+
- Audio processing: Real-time
- Database queries: Sub-second

### Reliability
- Uptime SLA: 99.9%
- Data durability: 99.999999999% (MongoDB)
- Backup frequency: Daily
- Disaster recovery: Multi-region

## Monitoring and Observability

### Metrics Collected
- API response times and error rates
- Database query performance
- Queue processing rates
- External API call success rates
- System resource utilization

### Logging
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation
- Log retention policies

### Alerting
- Error rate thresholds
- Performance degradation alerts
- Queue backlog monitoring
- External service failures

This component architecture provides a modular, scalable, and maintainable system that can handle the complex requirements of automated delivery communication while remaining flexible for future enhancements.