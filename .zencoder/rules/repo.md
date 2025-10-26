---
description: Repository Information Overview
alwaysApply: true
---

# Delivery Automation System Information

## Summary
A production-ready automated delivery communication system that calls customers ahead of delivery to collect availability and instructions, then relays audio recordings to delivery agents through multiple notification channels. The system features enterprise-grade security, performance optimization, AI-powered voice analysis, advanced analytics, progressive web app capabilities, and intelligent routing.

## Structure
- **src/**: Core application code (API, services, database)
- **tests/**: Comprehensive test suite (unit, integration, performance)
- **public/**: Static assets and PWA files
- **logs/**: Application logs

## Language & Runtime
**Language**: JavaScript (Node.js)
**Version**: Node.js (implied latest LTS)
**Framework**: Express.js v5.1.0
**Database**: MongoDB v8.0.0
**Cache/Queue**: Redis via ioredis v5.8.1

## Dependencies
**Main Dependencies**:
- **API Framework**: express v5.1.0
- **Database**: mongoose v8.0.0
- **Queue System**: bull v4.16.5, ioredis v5.8.1
- **Telephony**: twilio v5.10.3
- **Security**: helmet v8.1.0, express-rate-limit v8.1.0, bcryptjs v3.0.2, jsonwebtoken v9.0.2
- **Storage**: @aws-sdk/client-s3 v3.913.0 (Cloudflare R2)
- **Real-time**: socket.io v4.8.1
- **AI**: openai v6.5.0
- **Push Notifications**: web-push v3.6.7
- **Logging**: winston v3.18.3, winston-cloudwatch v6.3.0
- **Documentation**: swagger-jsdoc v6.2.8, swagger-ui-express v5.0.1

**Development Dependencies**:
- **Testing**: jest v30.2.0, supertest v7.1.4, sinon v21.0.0
- **Performance Testing**: autocannon v8.0.0
- **Development**: nodemon v3.1.10

## Build & Installation
```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production mode
npm start

# Run database migrations
npm run migrate

# Run tests
npm test
```

## Docker
**Docker Compose**: Includes PostgreSQL 15 and Redis 7 services
**Configuration**: Environment variables for database credentials and ports

## API Structure
**Core Endpoints**:
- `/api/deliveries`: Delivery management
- `/api/calls`: Call initiation and management
- `/api/recordings`: Access to customer recordings
- `/api/webhooks`: Twilio webhook handlers
- `/api/agents`: Agent management
- `/api/analytics`: Analytics and reporting
- `/api/routing`: Intelligent routing
- `/api/push`: Push notification management
- `/api/admin`: Admin dashboard and system management
- `/api/mobile`: Mobile-optimized endpoints

**Authentication**: JWT-based authentication and API key validation
**Documentation**: Swagger UI available at `/api-docs`

## Services
**Twilio Integration**: Outbound calling with TwiML, recording management
**AI Voice Analysis**: OpenAI Whisper for transcription, GPT for analysis
**Storage**: Cloudflare R2 for recording storage
**Push Notifications**: Web Push API with VAPID authentication
**Queue**: Bull for asynchronous job processing
**Caching**: Redis for performance optimization
**Monitoring**: Custom health checks and metrics endpoints

## Testing
**Framework**: Jest v30.2.0
**Test Types**: Unit, integration, API, security, performance
**Test Location**: `/tests` directory
**Naming Convention**: `*.test.js`
**Run Command**:
```bash
npm test
npm run test:unit
npm run test:integration
npm run test:coverage
```

## Security Features
- Helmet.js for HTTP security headers
- CORS configuration
- Rate limiting for API endpoints
- JWT authentication
- API key validation
- Input validation
- Secure storage for recordings
- Voice authentication capabilities

## Progressive Web App
**Features**: Service worker, push notifications, offline support
**Configuration**: Web manifest in `/public/manifest.json`
**Service Worker**: `/public/sw.js`