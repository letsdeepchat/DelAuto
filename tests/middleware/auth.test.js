// WORKING AUTH MIDDLEWARE TESTS - Based on actual implementation
const { authenticateApiKey, authenticateJWT, requireAdmin } = require('../../src/api/middleware/auth');

// Mock jsonwebtoken
jest.mock('jsonwebtoken');
const jwt = require('jsonwebtoken');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();

    // Clear environment variable before each test
    delete process.env.API_KEY;
    delete process.env.JWT_SECRET;
  });

  describe('authenticateApiKey', () => {
    it('should authenticate with valid API key in x-api-key header', () => {
      process.env.API_KEY = 'valid-api-key';
      req.headers['x-api-key'] = 'Bearer valid-api-key';

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate with valid API key in authorization header', () => {
      process.env.API_KEY = 'valid-api-key';
      req.headers['authorization'] = 'Bearer valid-api-key';

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request with missing API key', () => {
      authenticateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid API key', () => {
      process.env.API_KEY = 'valid-api-key';
      req.headers['x-api-key'] = 'Bearer invalid-api-key';

      authenticateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request when no valid API key is configured', () => {
      req.headers['x-api-key'] = 'Bearer some-key';

      authenticateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle API key without Bearer prefix', () => {
      process.env.API_KEY = 'valid-api-key';
      req.headers['x-api-key'] = 'valid-api-key';

      authenticateApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authenticateJWT', () => {
    it('should authenticate with valid JWT token', () => {
      const mockDecoded = { agentId: '123', role: 'agent' };
      jwt.verify.mockReturnValue(mockDecoded);
      req.headers['authorization'] = 'Bearer valid-jwt-token';
      process.env.JWT_SECRET = 'test-secret';

      authenticateJWT(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-jwt-token', 'test-secret');
      expect(req.agent).toEqual(mockDecoded);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should use default secret when JWT_SECRET not provided', () => {
      const mockDecoded = { agentId: '123', role: 'agent' };
      jwt.verify.mockReturnValue(mockDecoded);
      req.headers['authorization'] = 'Bearer valid-jwt-token';

      authenticateJWT(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-jwt-token', 'default_secret');
      expect(req.agent).toEqual(mockDecoded);
      expect(next).toHaveBeenCalled();
    });

    it('should reject request with missing token', () => {
      authenticateJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      req.headers['authorization'] = 'Bearer invalid-jwt-token';

      authenticateJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle authorization header without Bearer prefix', () => {
      req.headers['authorization'] = 'invalid-format-token';

      authenticateJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle empty token after Bearer', () => {
      req.headers['authorization'] = 'Bearer ';

      authenticateJWT(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin users', () => {
      req.agent = { agentId: '123', role: 'admin' };

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject non-admin users', () => {
      req.agent = { agentId: '123', role: 'agent' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject users with no role', () => {
      req.agent = { agentId: '123' };

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject when no agent in request', () => {
      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation, not assumptions!