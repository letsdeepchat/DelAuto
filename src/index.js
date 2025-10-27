require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const winston = require('winston');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const mongoSanitize = require('mongo-sanitize');

// Add multer for file uploads
const multer = require('multer');
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Database connection - ensure it connects before starting server
const connectDB = async () => {
  const mongoose = require('./database/connection');
  // Wait a bit for connection to establish
  await new Promise(resolve => setTimeout(resolve, 2000));
  return mongoose;
};

// Start queue worker
require('./queue/callWorker');

// Services
const monitoringService = require('./services/monitoringService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Delivery Automation API',
    version: '1.0.0',
    description: 'API for automated delivery communication system',
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: 'Development server',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Delivery: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            description: 'Delivery ID',
          },
          customer_id: {
            $ref: '#/components/schemas/Customer',
          },
          agent_id: {
            $ref: '#/components/schemas/Agent',
          },
          address: {
            type: 'string',
            description: 'Delivery address',
          },
          scheduled_time: {
            type: 'string',
            format: 'date-time',
            description: 'Scheduled delivery time',
          },
          status: {
            type: 'string',
            enum: ['scheduled', 'in_progress', 'completed', 'failed'],
            description: 'Delivery status',
          },
          created_at: {
            type: 'string',
            format: 'date-time',
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
          },
          name: {
            type: 'string',
          },
          phone: {
            type: 'string',
          },
          preferences: {
            type: 'object',
          },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
          },
          name: {
            type: 'string',
          },
          phone: {
            type: 'string',
          },
          current_location: {
            type: 'string',
          },
          active_deliveries: {
            type: 'number',
          },
        },
      },
    },
  },
  security: [
    {
      ApiKeyAuth: [],
    },
    {
      BearerAuth: [],
    },
  ],
};

const options = {
  swaggerDefinition,
  apis: ['./src/api/routes/*.js'], // Path to the API routes
};

const swaggerSpec = swaggerJsdoc(options);

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'delauto-api' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  );
}

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
      },
    },
  }),
);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || [
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Rate limiting with higher limits for authenticated requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 for better performance
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for internal/service accounts
    return req.user?.role === 'service' || req.headers['x-api-key'];
  }
});
app.use('/api/', limiter);

// Stricter rate limiting for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many sensitive requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware with size limits and security
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add NoSQL injection prevention and input sanitization
app.use((req, res, next) => {
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  req.params = mongoSanitize(req.params);

  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10485760) { // 10MB
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }
  next();
});

// Request monitoring middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  // Log request
  logger.info(`Request: ${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    query: req.query,
    body: req.method !== 'GET' ? req.body : undefined,
  });

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function (...args) {
    const responseTime = Date.now() - startTime;

    // Record metrics
    monitoringService.recordRequest(
      req.method,
      req.path,
      res.statusCode,
      responseTime,
    );

    // Log response
    logger.info(`Response: ${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('Content-Length'),
    });

    originalEnd.apply(this, args);
  };

  next();
});

// Import error handling middleware
const {
  errorHandler,
  notFoundHandler,
} = require('./api/middleware/errorHandler');

// Make io available in routes
app.set('io', io);

// Serve static files from public directory
app.use(express.static('public'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', './src/views');

// Routes
const { authenticateApiKey, authenticateJWT, requireAdmin } = require('./api/middleware/auth');
const deliveriesRouter = require('./api/routes/deliveries');
const callsRouter = require('./api/routes/calls');
const webhooksRouter = require('./api/routes/webhooks');
const recordingsRouter = require('./api/routes/recordings');
const agentsRouter = require('./api/routes/agents');
const authRouter = require('./api/routes/auth');
const analyticsRouter = require('./api/routes/analytics');
const routingRouter = require('./api/routes/routing');
const pushRouter = require('./api/routes/push');
const adminRouter = require('./api/routes/admin');
const mobileRouter = require('./api/routes/mobile');
const webRouter = require('./api/routes/web');

// File upload endpoint
app.post('/api/upload', authenticateJWT, upload.single('file'), (req, res) => {
  try {
    res.json({ success: true, file: req.file });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

app.use('/api/deliveries', authenticateApiKey, deliveriesRouter);
app.use('/api/calls', authenticateApiKey, callsRouter);
app.use('/api/recordings', authenticateApiKey, recordingsRouter);
app.use('/api/agents', agentsRouter); // Agents route with JWT auth
app.use('/api/auth', strictLimiter, authRouter); // Authentication routes with strict rate limiting
app.use('/api/analytics', authenticateApiKey, analyticsRouter); // Analytics routes with API key auth
app.use('/api/routing', authenticateApiKey, routingRouter); // Advanced routing routes with API key auth
app.use('/api/push', authenticateApiKey, pushRouter); // Push notification routes with API key auth
app.use('/api/admin', authenticateJWT, requireAdmin, strictLimiter, adminRouter); // Admin management routes with JWT and admin auth, strict rate limiting
app.use('/api/mobile', authenticateApiKey, mobileRouter); // Mobile app routes with API key auth
// Webhooks don't need auth as they come from Twilio
app.use('/api/webhooks', webhooksRouter);
// Web routes for UI
app.use('/', webRouter);

// API health check
app.get('/api', (req, res) => {
  res.json({ message: 'Delivery Automation API', status: 'running' });
});

// Health check with database connection test
app.get('/health', async (req, res) => {
  try {
    // Ping database
    const mongoose = require('mongoose');
    await mongoose.connection.db.admin().ping();

    const healthStatus = monitoringService.getHealthStatus();
    res
      .status(
        healthStatus.status === 'healthy'
          ? 200
          : healthStatus.status === 'warning'
            ? 200
            : 503,
      )
      .json(healthStatus);
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date()
    });
  }
});

// Health stats endpoint
app.get('/api/health/stats', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const stats = {
      database: {
        connections: mongoose.connection.readyState,
        name: mongoose.connection.name,
        host: mongoose.connection.host
      },
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Metrics endpoint (protected - should be behind authentication in production)
app.get('/metrics', (req, res) => {
  const metrics = monitoringService.getMetricsSummary();
  res.json(metrics);
});

// Rate limit headers test endpoint
app.get('/api/test/rate-limit', (req, res) => {
  res.json({
    success: true,
    message: 'Rate limit headers should be present',
    headers: {
      'ratelimit-limit': req.headers['ratelimit-limit'],
      'ratelimit-remaining': req.headers['ratelimit-remaining'],
      'retry-after': req.headers['retry-after']
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Agent connected:', socket.id);

  // Join agent room for notifications
  socket.on('join-agent-room', (agentId) => {
    socket.join(`agent_${agentId}`);
    console.log(`Agent ${agentId} joined room`);
  });

  socket.on('disconnect', () => {
    console.log('Agent disconnected:', socket.id);
  });
});

// Scheduled metrics logging (every 5 minutes) - only in non-test environments
if (process.env.NODE_ENV !== 'test') {
  setInterval(
    () => {
      monitoringService.logMetricsSummary();
    },
    5 * 60 * 1000,
  );
}

// Start server with database connection
const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`, { service: 'delauto-api' });
      logger.info(`Health check available at: http://localhost:${PORT}/health`, { service: 'delauto-api' });
      logger.info(`Metrics available at: http://localhost:${PORT}/metrics`, { service: 'delauto-api' });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
