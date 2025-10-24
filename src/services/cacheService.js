const Redis = require('ioredis');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.redis = null;
    this.isConnected = false;

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true, // Connect only when needed
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis cache connected');
      });

      this.redis.on('error', (error) => {
        this.isConnected = false;
        logger.warn('Redis cache connection error:', error.message);
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.info('Redis cache connection closed');
      });
    } catch (error) {
      logger.warn('Redis cache initialization failed:', error.message);
    }
  }

  /**
   * Set a value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache (will be JSON.stringify'd)
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async set(key, value, ttl = null) {
    if (!this.isConnected || !this.redis) {return false;}

    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.redis.setex(key, ttl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Parsed JSON value or null if not found/error
   */
  async get(key) {
    if (!this.isConnected || !this.redis) {return null;}

    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    if (!this.isConnected || !this.redis) {return false;}

    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  async exists(key) {
    if (!this.isConnected || !this.redis) {return false;}

    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Set multiple key-value pairs
   * @param {Object} keyValuePairs - Object with keys and values
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async mset(keyValuePairs, ttl = null) {
    if (!this.isConnected || !this.redis) {return false;}

    try {
      const pipeline = this.redis.pipeline();

      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const serializedValue = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   * @param {string[]} keys - Array of cache keys
   * @returns {Object} - Object with keys and parsed values
   */
  async mget(keys) {
    if (!this.isConnected || !this.redis) {return {};}

    try {
      const values = await this.redis.mget(keys);
      const result = {};

      keys.forEach((key, index) => {
        const value = values[index];
        result[key] = value ? JSON.parse(value) : null;
      });

      return result;
    } catch (error) {
      logger.error('Cache mget error:', error);
      return {};
    }
  }

  /**
   * Clear all cache
   */
  async flushAll() {
    if (!this.isConnected || !this.redis) {return false;}

    try {
      await this.redis.flushall();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isConnected || !this.redis) {
      return { connected: false, info: null };
    }

    try {
      const info = await this.redis.info();
      return {
        connected: true,
        info: this.parseRedisInfo(info),
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return { connected: false, info: null };
    }
  }

  /**
   * Parse Redis INFO command output
   * @param {string} info - Raw Redis info
   * @returns {Object} - Parsed info object
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};

    lines.forEach((line) => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });

    return result;
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }
}

// Export singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
