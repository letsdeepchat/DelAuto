// WORKING CACHE SERVICE TESTS - Based on actual implementation
const cacheService = require('../../src/services/cacheService');

// Mock ioredis to avoid external dependencies
jest.mock('ioredis');

const mockRedis = {
  setex: jest.fn(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  mget: jest.fn(),
  flushall: jest.fn(),
  info: jest.fn(),
  quit: jest.fn(),
  pipeline: jest.fn(() => ({
    setex: jest.fn(),
    set: jest.fn(),
    exec: jest.fn()
  }))
};

describe('CacheService', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Redis connection
    cacheService.redis = mockRedis;
    cacheService.isConnected = true;
  });

  describe('set method', () => {
    it('should set a value without TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await cacheService.set('test_key', { data: 'test' });

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith('test_key', '{"data":"test"}');
    });

    it('should set a value with TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const result = await cacheService.set('test_key', { data: 'test' }, 3600);

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith('test_key', 3600, '{"data":"test"}');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const result = await cacheService.set('test_key', { data: 'test' });

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      cacheService.isConnected = false;

      const result = await cacheService.set('test_key', { data: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('get method', () => {
    it('should get and parse JSON value', async () => {
      const testData = { message: 'hello', count: 42 };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheService.get('test_key');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('test_key');
    });

    it('should return null for non-existent key', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('nonexistent_key');

      expect(result).toBe(null);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedis.get.mockResolvedValue('invalid json{');

      const result = await cacheService.get('invalid_key');

      expect(result).toBe(null);
    });

    it('should return null when not connected', async () => {
      cacheService.isConnected = false;

      const result = await cacheService.get('test_key');

      expect(result).toBe(null);
    });
  });

  describe('del method', () => {
    it('should delete a key', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await cacheService.del('test_key');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test_key');
    });

    it('should handle deletion errors', async () => {
      mockRedis.del.mockRejectedValue(new Error('Delete failed'));

      const result = await cacheService.del('test_key');

      expect(result).toBe(false);
    });
  });

  describe('exists method', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists('existing_key');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('existing_key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists('nonexistent_key');

      expect(result).toBe(false);
    });

    it('should return false when not connected', async () => {
      cacheService.isConnected = false;

      const result = await cacheService.exists('test_key');

      expect(result).toBe(false);
    });
  });

  describe('mset method', () => {
    it('should set multiple key-value pairs', async () => {
      const keyValuePairs = {
        key1: { data: 'value1' },
        key2: { data: 'value2' }
      };

      const mockPipeline = {
        set: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const result = await cacheService.mset(keyValuePairs);

      expect(result).toBe(true);
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should set multiple key-value pairs with TTL', async () => {
      const keyValuePairs = { key1: 'value1', key2: 'value2' };

      const mockPipeline = {
        setex: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      const result = await cacheService.mset(keyValuePairs, 3600);

      expect(result).toBe(true);
      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.setex).toHaveBeenCalledWith('key1', 3600, '"value1"');
      expect(mockPipeline.setex).toHaveBeenCalledWith('key2', 3600, '"value2"');
    });
  });

  describe('mget method', () => {
    it('should get multiple values', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const values = ['{"data":"value1"}', '{"data":"value2"}', null];
      mockRedis.mget.mockResolvedValue(values);

      const result = await cacheService.mget(keys);

      expect(result).toEqual({
        key1: { data: 'value1' },
        key2: { data: 'value2' },
        key3: null
      });
      expect(mockRedis.mget).toHaveBeenCalledWith(keys);
    });
  });

  describe('flushAll method', () => {
    it('should clear all cache', async () => {
      mockRedis.flushall.mockResolvedValue('OK');

      const result = await cacheService.flushAll();

      expect(result).toBe(true);
      expect(mockRedis.flushall).toHaveBeenCalled();
    });
  });

  describe('getStats method', () => {
    it('should return stats when connected', async () => {
      const infoString = '# Server\r\nredis_version:6.2.0\r\n# Memory\r\nused_memory:1024';
      mockRedis.info.mockResolvedValue(infoString);

      const result = await cacheService.getStats();

      expect(result.connected).toBe(true);
      expect(result.info).toEqual({
        redis_version: '6.2.0',
        used_memory: '1024'
      });
    });

    it('should return disconnected status when not connected', async () => {
      cacheService.isConnected = false;

      const result = await cacheService.getStats();

      expect(result.connected).toBe(false);
      expect(result.info).toBe(null);
    });
  });

  describe('parseRedisInfo method', () => {
    it('should parse Redis INFO output correctly', () => {
      const infoString = '# Server\r\nredis_version:6.2.0\r\n# Memory\r\nused_memory:1024\r\n';

      const result = cacheService.parseRedisInfo(infoString);

      expect(result).toEqual({
        redis_version: '6.2.0',
        used_memory: '1024'
      });
    });

    it('should handle empty or invalid info gracefully', () => {
      const result = cacheService.parseRedisInfo('');

      expect(result).toEqual({});
    });
  });

  describe('close method', () => {
    it('should close Redis connection', async () => {
      mockRedis.quit.mockResolvedValue('OK');

      await cacheService.close();

      expect(mockRedis.quit).toHaveBeenCalled();
      expect(cacheService.isConnected).toBe(false);
    });
  });
});

// WORKING TESTS END HERE - Based on ACTUAL implementation, not assumptions!