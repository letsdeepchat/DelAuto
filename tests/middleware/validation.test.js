// WORKING VALIDATION MIDDLEWARE TESTS - Based on actual implementation
const Joi = require('joi');
const { validateBody, validateQuery, validateParams, schemas } = require('../../src/api/middleware/validation');

describe('Validation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      body: {},
      query: {},
      params: {},
      headers: {}
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    const testSchema = Joi.object({
      name: Joi.string().min(2).required(),
      email: Joi.string().email().required(),
      age: Joi.number().integer().min(0)
    });

    it('should pass validation with valid data', () => {
      req.body = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25
      };

      const middleware = validateBody(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail validation with invalid data', () => {
      req.body = {
        name: 'J', // Too short
        email: 'invalid-email',
        age: -5 // Negative age
      };

      const middleware = validateBody(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: expect.any(String),
        details: expect.any(Array)
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should fail validation with missing required fields', () => {
      req.body = {
        age: 25
      };

      const middleware = validateBody(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation Error',
        message: expect.stringContaining('required'),
        details: expect.any(Array)
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateQuery', () => {
    const testSchema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10)
    });

    it('should pass validation with valid query params', () => {
      req.query = {
        page: '1',
        limit: '10'
      };

      const middleware = validateQuery(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail validation with invalid query params', () => {
      req.query = {
        page: '0', // Invalid page number
        limit: '150' // Exceeds max limit
      };

      const middleware = validateQuery(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Query Validation Error',
        message: expect.any(String),
        details: expect.any(Array)
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    const testSchema = Joi.object({
      id: Joi.string().length(24).hex().required()
    });

    it('should pass validation with valid params', () => {
      req.params = {
        id: '507f1f77bcf86cd799439011' // Valid MongoDB ObjectId
      };

      const middleware = validateParams(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail validation with invalid params', () => {
      req.params = {
        id: 'invalid-id' // Invalid format
      };

      const middleware = validateParams(testSchema);
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Parameter Validation Error',
        message: expect.any(String),
        details: expect.any(Array)
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('schemas.agentCreate', () => {
    it('should validate agent creation with all required fields', () => {
      const agentData = {
        name: 'John Agent',
        email: 'agent@example.com',
        phone: '+15555551234',
        password: 'securepassword123',
        role: 'agent'
      };

      const { error } = schemas.agentCreate.validate(agentData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid phone number', () => {
      const agentData = {
        name: 'John Agent',
        email: 'agent@example.com',
        phone: 'invalid-phone',
        password: 'securepassword123'
      };

      const { error } = schemas.agentCreate.validate(agentData);
      expect(error).toBeDefined();
      expect(error.message).toContain('phone');
    });

    it('should fail with short password', () => {
      const agentData = {
        name: 'John Agent',
        email: 'agent@example.com',
        phone: '+15555551234',
        password: '123' // Too short
      };

      const { error } = schemas.agentCreate.validate(agentData);
      expect(error).toBeDefined();
      expect(error.message).toContain('password');
    });

    it('should validate location coordinates', () => {
      const agentData = {
        name: 'John Agent',
        email: 'agent@example.com',
        phone: '+15555551234',
        password: 'securepassword123',
        current_location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749]
        }
      };

      const { error } = schemas.agentCreate.validate(agentData);
      expect(error).toBeUndefined();
    });
  });

  describe('schemas.deliveryCreate', () => {
    it('should validate delivery creation with all required fields', () => {
      const deliveryData = {
        customer_name: 'John Customer',
        customer_phone: '+15555551234',
        address: '123 Main Street, City, State 12345',
        scheduled_time: new Date().toISOString(),
        priority: 'medium'
      };

      const { error } = schemas.deliveryCreate.validate(deliveryData);
      expect(error).toBeUndefined();
    });

    it('should validate delivery items', () => {
      const deliveryData = {
        customer_name: 'John Customer',
        customer_phone: '+15555551234',
        address: '123 Main Street, City, State 12345',
        scheduled_time: new Date().toISOString(),
        items: [
          {
            name: 'Package 1',
            quantity: 2,
            value: 29.99
          }
        ]
      };

      const { error } = schemas.deliveryCreate.validate(deliveryData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid priority', () => {
      const deliveryData = {
        customer_name: 'John Customer',
        customer_phone: '+15555551234',
        address: '123 Main Street, City, State 12345',
        scheduled_time: new Date().toISOString(),
        priority: 'invalid-priority'
      };

      const { error } = schemas.deliveryCreate.validate(deliveryData);
      expect(error).toBeDefined();
      expect(error.message).toContain('priority');
    });
  });

  describe('schemas.callInitiate', () => {
    it('should validate call initiation data', () => {
      const callData = {
        delivery_id: '507f1f77bcf86cd799439011',
        customer_phone: '+15555551234',
        agent_id: '507f1f77bcf86cd799439012'
      };

      const { error } = schemas.callInitiate.validate(callData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid ObjectId', () => {
      const callData = {
        delivery_id: 'invalid-id',
        customer_phone: '+15555551234',
        agent_id: '507f1f77bcf86cd799439012'
      };

      const { error } = schemas.callInitiate.validate(callData);
      expect(error).toBeDefined();
      expect(error.message).toContain('delivery_id');
    });
  });

  describe('schemas.locationUpdate', () => {
    it('should validate location update data', () => {
      const locationData = {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 5.0,
        timestamp: new Date().toISOString()
      };

      const { error } = schemas.locationUpdate.validate(locationData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid coordinates', () => {
      const locationData = {
        latitude: 200, // Invalid latitude
        longitude: -300, // Invalid longitude
      };

      const { error } = schemas.locationUpdate.validate(locationData);
      expect(error).toBeDefined();
    });
  });

  describe('schemas.pagination', () => {
    it('should validate pagination parameters', () => {
      const paginationData = {
        page: 1,
        limit: 10,
        sort: 'created_at',
        order: 'desc'
      };

      const { error } = schemas.pagination.validate(paginationData);
      expect(error).toBeUndefined();
    });

    it('should apply defaults for missing values', () => {
      const paginationData = {};

      const { error, value } = schemas.pagination.validate(paginationData);
      expect(error).toBeUndefined();
      expect(value.page).toBe(1);
      expect(value.limit).toBe(10);
      expect(value.order).toBe('desc');
    });

    it('should fail with invalid order value', () => {
      const paginationData = {
        order: 'invalid'
      };

      const { error } = schemas.pagination.validate(paginationData);
      expect(error).toBeDefined();
      expect(error.message).toContain('order');
    });
  });

  describe('schemas.login', () => {
    it('should validate login credentials', () => {
      const loginData = {
        email: 'user@example.com',
        password: 'password123'
      };

      const { error } = schemas.login.validate(loginData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid email', () => {
      const loginData = {
        email: 'invalid-email',
        password: 'password123'
      };

      const { error } = schemas.login.validate(loginData);
      expect(error).toBeDefined();
      expect(error.message).toContain('email');
    });
  });

  describe('schemas.idParam', () => {
    it('should validate MongoDB ObjectId parameter', () => {
      const paramData = {
        id: '507f1f77bcf86cd799439011'
      };

      const { error } = schemas.idParam.validate(paramData);
      expect(error).toBeUndefined();
    });

    it('should fail with invalid ObjectId format', () => {
      const paramData = {
        id: 'not-valid-objectid'
      };

      const { error } = schemas.idParam.validate(paramData);
      expect(error).toBeDefined();
      expect(error.message).toContain('id');
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation!