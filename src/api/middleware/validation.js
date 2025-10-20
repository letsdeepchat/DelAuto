const Joi = require('joi');

/**
 * Middleware to validate request body against a Joi schema
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateBody = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
        details: error.details
      });
    }
    next();
  };
};

/**
 * Middleware to validate request query parameters against a Joi schema
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Query Validation Error',
        message: error.details[0].message,
        details: error.details
      });
    }
    next();
  };
};

/**
 * Middleware to validate request params against a Joi schema
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({
        error: 'Parameter Validation Error',
        message: error.details[0].message,
        details: error.details
      });
    }
    next();
  };
};

// Common validation schemas
const schemas = {
  // Agent validation
  agentCreate: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    password: Joi.string().min(8).required(),
    role: Joi.string().valid('agent', 'supervisor', 'admin').default('agent'),
    current_location: Joi.object({
      type: Joi.string().valid('Point').default('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2)
    })
  }),

  agentUpdate: Joi.object({
    name: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    password: Joi.string().min(8),
    role: Joi.string().valid('agent', 'supervisor', 'admin'),
    current_location: Joi.object({
      type: Joi.string().valid('Point'),
      coordinates: Joi.array().items(Joi.number()).length(2)
    }),
    is_active: Joi.boolean()
  }),

  // Delivery validation
  deliveryCreate: Joi.object({
    customer_name: Joi.string().min(2).max(100).required(),
    customer_phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    address: Joi.string().min(10).max(500).required(),
    scheduled_time: Joi.date().iso().required(),
    special_instructions: Joi.string().max(1000),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    items: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
        value: Joi.number().min(0)
      })
    )
  }),

  deliveryUpdate: Joi.object({
    customer_name: Joi.string().min(2).max(100),
    customer_phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    address: Joi.string().min(10).max(500),
    scheduled_time: Joi.date().iso(),
    special_instructions: Joi.string().max(1000),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    status: Joi.string().valid('pending', 'assigned', 'in_transit', 'delivered', 'failed', 'cancelled'),
    items: Joi.array().items(
      Joi.object({
        name: Joi.string(),
        quantity: Joi.number().integer().min(1),
        value: Joi.number().min(0)
      })
    )
  }),

  // Call validation
  callInitiate: Joi.object({
    delivery_id: Joi.string().length(24).hex().required(), // MongoDB ObjectId
    customer_phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    agent_id: Joi.string().length(24).hex().required()
  }),

  // Push notification validation
  pushSubscribe: Joi.object({
    endpoint: Joi.string().uri().required(),
    keys: Joi.object({
      p256dh: Joi.string().required(),
      auth: Joi.string().required()
    }).required()
  }),

  // Mobile location update
  locationUpdate: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    accuracy: Joi.number().min(0),
    timestamp: Joi.date().iso()
  }),

  // Login validation
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // ID parameter validation
  idParam: Joi.object({
    id: Joi.string().length(24).hex().required()
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
  schemas
};