# Installation Guide

This guide provides step-by-step instructions for setting up the DelAuto Delivery Automation System.

## Prerequisites

### System Requirements

#### Minimum Requirements
- **Node.js**: 18.0.0 or higher
- **MongoDB**: 6.0 or higher (or MongoDB Atlas)
- **Redis**: 7.0 or higher (optional for development)
- **Memory**: 4GB RAM minimum, 8GB recommended
- **Storage**: 10GB free space
- **Operating System**: Linux, macOS, or Windows

#### Recommended Production Setup
- **Node.js**: 20.x LTS
- **MongoDB**: 8.0 with replica set
- **Redis**: 7.x with persistence
- **Memory**: 16GB RAM
- **CPU**: 4+ cores
- **Storage**: SSD with 100GB+ capacity

### Required Software

#### Package Managers
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install curl wget git

# macOS
brew install curl wget git

# Windows (using Chocolatey)
choco install curl wget git
```

#### Node.js Installation
```bash
# Using Node Version Manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

#### MongoDB Installation

**Option 1: Local Installation (Development)**
```bash
# Ubuntu/Debian
sudo apt install mongodb

# macOS
brew install mongodb-community

# Windows
choco install mongodb

# Start MongoDB
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # macOS
```

**Option 2: MongoDB Atlas (Production/Cloud)**
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free account
3. Create a new cluster
4. Get connection string from Atlas dashboard

#### Redis Installation (Optional for Development)

```bash
# Ubuntu/Debian
sudo apt install redis-server

# macOS
brew install redis

# Windows
choco install redis-64

# Start Redis
sudo systemctl start redis  # Linux
brew services start redis  # macOS
```

## Project Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/delauto.git
cd delauto
```

### 2. Install Dependencies

```bash
npm install
```

This will install all dependencies listed in `package.json`:
- **express**: Web framework
- **mongoose**: MongoDB ODM
- **twilio**: Communications API
- **ioredis**: Redis client
- **winston**: Logging
- **helmet**: Security middleware
- **cors**: Cross-origin resource sharing
- **compression**: Response compression
- **express-rate-limit**: Rate limiting
- **joi**: Input validation
- **openai**: AI services
- **web-push**: Push notifications
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT authentication

### 3. Environment Configuration

#### Copy Environment Template
```bash
cp .env.example .env
```

#### Configure Environment Variables

**Required Variables:**
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/delauto

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-here

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# OpenAI Configuration (optional)
OPENAI_API_KEY=your-openai-api-key

# Push Notifications (optional)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

#### Generate Secure Secrets

**JWT Secret:**
```bash
# Generate a secure random string
openssl rand -hex 32
```

**VAPID Keys (for Push Notifications):**
```javascript
// Run this in Node.js REPL
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();
console.log(vapidKeys);
```

### 4. Database Setup

#### Initialize MongoDB Database

The application will automatically create collections when it starts. However, you can manually initialize if needed:

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/delauto

# Create database (if not using auto-creation)
use delauto
```

#### Database Indexes

Indexes are automatically created by Mongoose. To manually create indexes:

```javascript
// Run in MongoDB shell or create a script
db.agents.createIndex({ email: 1 }, { unique: true })
db.agents.createIndex({ phone: 1 }, { unique: true })
db.customers.createIndex({ phone: 1 }, { unique: true })
db.deliveries.createIndex({ scheduled_time: 1 })
db.deliveries.createIndex({ status: 1 })
```

### 5. Twilio Setup

#### 1. Create Twilio Account
1. Go to [Twilio Console](https://console.twilio.com)
2. Sign up for a free account
3. Complete account verification

#### 2. Get Account Credentials
- **Account SID**: Found in Dashboard
- **Auth Token**: Found in Dashboard
- Add these to your `.env` file

#### 3. Purchase Phone Number
1. Go to Phone Numbers → Manage
2. Click "Buy a number"
3. Search for a number with voice capabilities
4. Complete purchase
5. Add the number to your `.env` file

#### 4. Configure Webhooks
Webhooks are configured programmatically, but you can verify them in Twilio Console:
- Voice: `https://your-domain.com/api/webhooks/voice`
- Status: `https://your-domain.com/api/webhooks/call-status`

### 6. OpenAI Setup (Optional)

#### 1. Create OpenAI Account
1. Go to [OpenAI Platform](https://platform.openai.com)
2. Sign up and complete verification
3. Navigate to API Keys section

#### 2. Generate API Key
1. Click "Create new secret key"
2. Copy the key (save it securely)
3. Add to your `.env` file

#### 3. Set Up Billing
- Add payment method for API usage
- Set usage limits to prevent unexpected charges

### 7. Cloudflare R2 Setup (Production)

#### 1. Create Cloudflare Account
1. Go to [Cloudflare](https://cloudflare.com)
2. Sign up and verify account

#### 2. Create R2 Bucket
1. Go to R2 in Cloudflare Dashboard
2. Click "Create bucket"
3. Name: `delauto-recordings`
4. Region: Choose closest to your users

#### 3. Generate API Tokens
1. Go to R2 → API Tokens
2. Create token with R2 permissions
3. Copy Account ID, Access Key ID, and Secret Access Key

#### 4. Configure Environment
```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_R2_BUCKET=delauto-recordings
```

## Running the Application

### Development Mode

```bash
# Start with nodemon (auto-restart on changes)
npm run dev

# Or start directly
npm start
```

The server will start on `http://localhost:3000`

### Production Mode

```bash
# Set production environment
export NODE_ENV=production

# Start the server
npm start
```

### Verify Installation

#### 1. Health Check
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T12:00:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "twilio": "healthy"
  }
}
```

#### 2. API Documentation
Visit `http://localhost:3000/api-docs` to see Swagger documentation.

#### 3. Test API Endpoint
```bash
curl http://localhost:3000/api
```

Expected response:
```json
{
  "message": "Delivery Automation API",
  "status": "running"
}
```

## Testing Setup

### Run Test Suite

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test types
npm run test:unit
npm run test:integration
```

### Test Configuration

Tests use a separate MongoDB database. Configure in `tests/jest.config.js`:

```javascript
process.env.MONGODB_URI = 'mongodb://localhost:27017/delauto_test';
process.env.JWT_SECRET = 'test_jwt_secret';
```

## Troubleshooting Installation

### Common Issues

#### MongoDB Connection Failed
```bash
# Check if MongoDB is running
sudo systemctl status mongodb

# Check MongoDB logs
tail -f /var/log/mongodb/mongod.log

# Test connection
mongosh mongodb://localhost:27017
```

#### Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping

# Start Redis if not running
sudo systemctl start redis
```

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### Node.js Version Issues
```bash
# Check current version
node --version

# Switch version with nvm
nvm use 20

# Update npm
npm install -g npm@latest
```

#### Permission Errors
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
```

### Environment-Specific Issues

#### Windows Issues
- Use Git Bash instead of Command Prompt
- Ensure MongoDB is in PATH
- Use `mongosh` instead of `mongo`

#### macOS Issues
- Install Xcode Command Line Tools: `xcode-select --install`
- Use Homebrew for package management
- Check firewall settings for MongoDB/Redis

#### Linux Issues
- Ensure proper user permissions for MongoDB data directory
- Check SELinux/AppArmor policies
- Verify firewall rules for required ports

### Logs and Debugging

#### Application Logs
```bash
# View application logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log
```

#### Enable Debug Mode
```bash
DEBUG=delauto:* npm run dev
```

#### Database Debugging
```bash
# Enable MongoDB profiling
db.setProfilingLevel(2)

# View slow queries
db.system.profile.find().sort({ ts: -1 }).limit(5)
```

## Next Steps

After successful installation:

1. **Create Admin User**: Use the registration endpoint to create your first admin user
2. **Configure Webhooks**: Set up Twilio webhooks if using production Twilio
3. **Test Core Flow**: Create a delivery and test the call functionality
4. **Set Up Monitoring**: Configure logging and monitoring as described in the monitoring guide
5. **Review Security**: Follow the security hardening guide for production deployment

## Support

For installation issues:
- Check the [Troubleshooting Guide](../troubleshooting/common-issues.md)
- Review [Environment Configuration](configuration.md)
- Contact the development team

---

**Installation completed successfully!** 🎉

Your DelAuto system is now ready for development and testing.