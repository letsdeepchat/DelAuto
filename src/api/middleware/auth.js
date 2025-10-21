const jwt = require('jsonwebtoken');
const Agent = require('../../database/models/Agent');

// Basic API key authentication middleware (for internal APIs)
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  // In production, validate against database or secure store
  // For development, use environment variable
  const validApiKey = process.env.API_KEY;

  if (!validApiKey || apiKey !== `Bearer ${validApiKey}`) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
};

// JWT authentication middleware for agents
const authenticateJWT = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    req.agent = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check if agent is admin
const requireAdmin = (req, res, next) => {
  if (!req.agent || req.agent.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = {
  authenticateApiKey,
  authenticateJWT,
  requireAdmin
};