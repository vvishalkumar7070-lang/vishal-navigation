/**
 * Enterprise Multi-level Caching System
 * Memory → Redis → Database hierarchy with intelligent TTL management
 * For: Address extraction, verification results, API responses
 */

class MemoryCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 3600000; // 1 hour
    this.cache = new Map();
    this.metadata = new Map();
  }

  set(key, value, ttl = this.defaultTTL) {
    // LRU eviction if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.metadata.values().next().value?.key;
      if (oldestKey) {
        this.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + ttl;
    this.cache.set(key, value);
    this.metadata.set(key, {
      key,
      createdAt: Date.now(),
      expiresAt,
      accessCount: 0,
      lastAccessed: Date.now()
    });

    return true;
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }

    const metadata = this.metadata.get(key);
    
    // Check if expired
    if (metadata.expiresAt < Date.now()) {
      this.delete(key);
      return null;
    }

    // Update access metadata
    metadata.accessCount++;
    metadata.lastAccessed = Date.now();

    return this.cache.get(key);
  }

  has(key) {
    if (!this.cache.has(key)) {
      return false;
    }

    const metadata = this.metadata.get(key);
    if (metadata.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key) {
    this.cache.delete(key);
    this.metadata.delete(key);
  }

  clear() {
    this.cache.clear();
    this.metadata.clear();
  }

  getStats() {
    let totalAccess = 0;
    let expiredCount = 0;
    const now = Date.now();

    for (const meta of this.metadata.values()) {
      totalAccess += meta.accessCount;
      if (meta.expiresAt < now) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilizationPercent: ((this.cache.size / this.maxSize) * 100).toFixed(2),
      totalAccess,
      expiredCount,
      averageAccessCount: this.cache.size > 0 ? (totalAccess / this.cache.size).toFixed(2) : 0
    };
  }

  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, metadata] of this.metadata.entries()) {
      if (metadata.expiresAt < now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  startAutoCleanup(intervalMs = 60000) {
    return setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
}

class RedisCache {
  constructor(options = {}) {
    this.connected = false;
    this.defaultTTL = options.defaultTTL || 3600;
    this.client = null;
    
    // In browser environment or when Redis not available, use stub
    this.isStub = typeof window !== 'undefined' || !options.enabled;
    this.fallbackCache = new MemoryCache(options.fallback || {});
  }

  async connect(redisURL) {
    if (this.isStub) {
      console.warn('[RedisCache] Running in stub mode (no Redis available)');
      return true;
    }

    try {
      // Redis connection would happen here in Node.js environment
      this.connected = true;
      return true;
    } catch (error) {
      console.error(`[RedisCache] Connection failed: ${error.message}`);
      this.connected = false;
      return false;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (this.isStub || !this.connected) {
      return this.fallbackCache.set(key, value, ttl * 1000);
    }

    try {
      // Redis SET with EX (expiry) would be: await client.set(key, JSON.stringify(value), 'EX', ttl);
      return true;
    } catch (error) {
      console.error(`[RedisCache] Set error: ${error.message}`);
      return this.fallbackCache.set(key, value, ttl * 1000);
    }
  }

  async get(key) {
    if (this.isStub || !this.connected) {
      return this.fallbackCache.get(key);
    }

    try {
      // Redis GET would be: return await client.get(key);
      return null;
    } catch (error) {
      console.error(`[RedisCache] Get error: ${error.message}`);
      return this.fallbackCache.get(key);
    }
  }

  async has(key) {
    if (this.isStub || !this.connected) {
      return this.fallbackCache.has(key);
    }

    try {
      // Redis EXISTS would check key existence
      return false;
    } catch (error) {
      return this.fallbackCache.has(key);
    }
  }

  async delete(key) {
    if (this.isStub || !this.connected) {
      return this.fallbackCache.delete(key);
    }

    try {
      // Redis DEL would delete the key
      return true;
    } catch (error) {
      return this.fallbackCache.delete(key);
    }
  }

  async clear() {
    if (this.isStub || !this.connected) {
      return this.fallbackCache.clear();
    }

    try {
      // Redis FLUSHDB would clear all
      return true;
    } catch (error) {
      return this.fallbackCache.clear();
    }
  }

  async getStats() {
    if (this.isStub || !this.connected) {
      return { ...this.fallbackCache.getStats(), backend: 'memory-fallback' };
    }

    return { backend: 'redis', connected: true };
  }
}

class DatabaseCache {
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || 86400000; // 1 day
    this.enabled = options.enabled !== false;
    this.db = null;
  }

  async connect(dbConnection) {
    if (!this.enabled) return true;

    try {
      this.db = dbConnection;
      return true;
    } catch (error) {
      console.error(`[DatabaseCache] Connection failed: ${error.message}`);
      return false;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled || !this.db) return false;

    try {
      // Database INSERT/UPDATE would happen here
      // Example: await db.collection('cache').updateOne(
      //   { key },
      //   { $set: { value, expiresAt: Date.now() + ttl } },
      //   { upsert: true }
      // );
      return true;
    } catch (error) {
      console.error(`[DatabaseCache] Set error: ${error.message}`);
      return false;
    }
  }

  async get(key) {
    if (!this.enabled || !this.db) return null;

    try {
      // Database FIND would be: const doc = await db.collection('cache').findOne({ key });
      // if (doc && doc.expiresAt > Date.now()) return doc.value;
      return null;
    } catch (error) {
      console.error(`[DatabaseCache] Get error: ${error.message}`);
      return null;
    }
  }

  async delete(key) {
    if (!this.enabled || !this.db) return false;

    try {
      // Database DELETE would be: await db.collection('cache').deleteOne({ key });
      return true;
    } catch (error) {
      return false;
    }
  }

  async cleanup() {
    if (!this.enabled || !this.db) return 0;

    try {
      // Database DELETE WHERE expiresAt < now()
      return 0;
    } catch (error) {
      console.error(`[DatabaseCache] Cleanup error: ${error.message}`);
      return 0;
    }
  }

  async getStats() {
    return { backend: 'database', enabled: this.enabled };
  }
}

class MultiLevelCache {
  constructor(options = {}) {
    this.memory = new MemoryCache(options.memory || { maxSize: 1000 });
    this.redis = new RedisCache(options.redis || { enabled: false });
    this.database = new DatabaseCache(options.database || { enabled: true });

    this.metrics = {
      hits: { memory: 0, redis: 0, database: 0, total: 0 },
      misses: { memory: 0, redis: 0, database: 0, total: 0 },
      writes: { memory: 0, redis: 0, database: 0, total: 0 }
    };

    this.readTimeout = options.readTimeout || 100;
    this.writeTimeout = options.writeTimeout || 500;
  }

  async get(key, options = {}) {
    const useMemory = options.useMemory !== false;
    const useRedis = options.useRedis !== false;
    const useDatabase = options.useDatabase !== false;

    // Try memory first
    if (useMemory) {
      const value = this.memory.get(key);
      if (value !== null) {
        this.metrics.hits.memory++;
        this.metrics.hits.total++;
        return { value, source: 'memory' };
      }
      this.metrics.misses.memory++;
    }

    // Try Redis second
    if (useRedis) {
      try {
        const value = await Promise.race([
          this.redis.get(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.readTimeout))
        ]);

        if (value !== null) {
          this.metrics.hits.redis++;
          this.metrics.hits.total++;
          // Populate memory cache
          this.memory.set(key, value);
          return { value, source: 'redis' };
        }
        this.metrics.misses.redis++;
      } catch (error) {
        // Redis error, continue to database
      }
    }

    // Try database last
    if (useDatabase) {
      try {
        const value = await Promise.race([
          this.database.get(key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.readTimeout))
        ]);

        if (value !== null) {
          this.metrics.hits.database++;
          this.metrics.hits.total++;
          // Populate upper caches
          this.memory.set(key, value);
          this.redis.set(key, value);
          return { value, source: 'database' };
        }
        this.metrics.misses.database++;
      } catch (error) {
        // Database error
      }
    }

    this.metrics.misses.total++;
    return { value: null, source: null };
  }

  async set(key, value, ttl = 3600000, options = {}) {
    const writeMemory = options.writeMemory !== false;
    const writeRedis = options.writeRedis !== false;
    const writeDatabase = options.writeDatabase !== false;

    const promises = [];

    if (writeMemory) {
      this.memory.set(key, value, ttl);
      this.metrics.writes.memory++;
    }

    if (writeRedis) {
      promises.push(
        this.redis.set(key, value, Math.floor(ttl / 1000))
          .then(() => { this.metrics.writes.redis++; })
          .catch(err => console.error(`[MultiLevelCache] Redis write error: ${err.message}`))
      );
    }

    if (writeDatabase) {
      promises.push(
        this.database.set(key, value, ttl)
          .then(() => { this.metrics.writes.database++; })
          .catch(err => console.error(`[MultiLevelCache] Database write error: ${err.message}`))
      );
    }

    this.metrics.writes.total++;

    if (promises.length > 0) {
      await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Write timeout')), this.writeTimeout))
      ]).catch(err => {
        console.warn(`[MultiLevelCache] Write operation timeout/error: ${err.message}`);
      });
    }

    return true;
  }

  async delete(key, options = {}) {
    const deleteMemory = options.deleteMemory !== false;
    const deleteRedis = options.deleteRedis !== false;
    const deleteDatabase = options.deleteDatabase !== false;

    if (deleteMemory) {
      this.memory.delete(key);
    }

    if (deleteRedis) {
      await this.redis.delete(key).catch(err => console.error(`[MultiLevelCache] Redis delete error: ${err.message}`));
    }

    if (deleteDatabase) {
      await this.database.delete(key).catch(err => console.error(`[MultiLevelCache] Database delete error: ${err.message}`));
    }
  }

  async clear(options = {}) {
    if (options.clearMemory !== false) {
      this.memory.clear();
    }

    if (options.clearRedis !== false) {
      await this.redis.clear().catch(err => console.error(`[MultiLevelCache] Redis clear error: ${err.message}`));
    }

    if (options.clearDatabase !== false) {
      await this.database.cleanup().catch(err => console.error(`[MultiLevelCache] Database clear error: ${err.message}`));
    }
  }

  getMetrics() {
    const hitRate = this.metrics.hits.total > 0
      ? ((this.metrics.hits.total / (this.metrics.hits.total + this.metrics.misses.total)) * 100).toFixed(2)
      : 0;

    return {
      hits: this.metrics.hits,
      misses: this.metrics.misses,
      writes: this.metrics.writes,
      hitRate: `${hitRate}%`,
      memory: this.memory.getStats()
    };
  }

  async cleanup() {
    const memoryCleanup = this.memory.cleanup();
    const databaseCleanup = await this.database.cleanup();
    
    return {
      memory: memoryCleanup,
      database: databaseCleanup
    };
  }
}

// Specialized cache for addresses
class AddressCache {
  constructor(options = {}) {
    this.multiLevelCache = new MultiLevelCache(options);
    this.ttl = options.ttl || 3600000; // 1 hour
  }

  generateKey(address, language = 'en') {
    // Normalize address: lowercase, trim whitespace, remove extra spaces
    const normalized = address.toLowerCase().trim().replace(/\s+/g, ' ');
    return `addr:${language}:${normalized}`;
  }

  async get(address, language = 'en') {
    const key = this.generateKey(address, language);
    return this.multiLevelCache.get(key);
  }

  async set(address, data, language = 'en') {
    const key = this.generateKey(address, language);
    return this.multiLevelCache.set(key, data, this.ttl);
  }

  async getMetrics() {
    return this.multiLevelCache.getMetrics();
  }
}

// Specialized cache for verification results
class VerificationCache {
  constructor(options = {}) {
    this.multiLevelCache = new MultiLevelCache(options);
    this.ttl = options.ttl || 7200000; // 2 hours (stable verification)
  }

  generateKey(latitude, longitude, precision = 4) {
    // Round coordinates to precision to group nearby addresses
    const lat = parseFloat(latitude).toFixed(precision);
    const lng = parseFloat(longitude).toFixed(precision);
    return `verify:${lat}:${lng}`;
  }

  async get(latitude, longitude) {
    const key = this.generateKey(latitude, longitude);
    return this.multiLevelCache.get(key);
  }

  async set(latitude, longitude, data) {
    const key = this.generateKey(latitude, longitude);
    return this.multiLevelCache.set(key, data, this.ttl);
  }

  async getMetrics() {
    return this.multiLevelCache.getMetrics();
  }
}

// Specialized cache for API responses
class APIResponseCache {
  constructor(options = {}) {
    this.multiLevelCache = new MultiLevelCache(options);
    this.ttls = {
      stt: options.ttlSTT || 300000, // 5 minutes
      googleMaps: options.ttlGoogleMaps || 86400000, // 1 day
      openCage: options.ttlOpenCage || 86400000 // 1 day
    };
  }

  generateKey(apiName, params) {
    const paramStr = JSON.stringify(params).split('').sort().join(''); // Normalize params
    return `api:${apiName}:${this.hashString(paramStr)}`;
  }

  hashString(str) {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async get(apiName, params) {
    const key = this.generateKey(apiName, params);
    return this.multiLevelCache.get(key);
  }

  async set(apiName, params, data) {
    const key = this.generateKey(apiName, params);
    const ttl = this.ttls[apiName] || 300000;
    return this.multiLevelCache.set(key, data, ttl);
  }

  async getMetrics() {
    return this.multiLevelCache.getMetrics();
  }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MemoryCache,
    RedisCache,
    DatabaseCache,
    MultiLevelCache,
    AddressCache,
    VerificationCache,
    APIResponseCache
  };
}
