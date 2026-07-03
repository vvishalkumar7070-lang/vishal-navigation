/**
 * Enterprise Rate Limiting & DDoS Protection
 * Per-agent, per-API, and global rate limiting with sliding window algorithm
 * Production-grade protection for Vishal Navigation
 */

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 100;
    this.message = options.message || 'Too many requests, please try again later';
    this.statusCode = options.statusCode || 429;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip || 'unknown');
    
    this.requests = new Map(); // key -> array of timestamps
    this.cleanupInterval = options.cleanupInterval || 60000;
    this.startCleanupTimer();
  }

  isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request history for this key
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const history = this.requests.get(key);

    // Remove old requests outside the window
    const recentRequests = history.filter(timestamp => timestamp > windowStart);
    this.requests.set(key, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    return true;
  }

  getStatus(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      return {
        key,
        remaining: this.maxRequests,
        reset: new Date(now + this.windowMs),
        limit: this.maxRequests
      };
    }

    const history = this.requests.get(key);
    const recentRequests = history.filter(timestamp => timestamp > windowStart);
    const remaining = Math.max(0, this.maxRequests - recentRequests.length);
    const oldestRequest = Math.min(...recentRequests);
    const resetTime = oldestRequest + this.windowMs;

    return {
      key,
      remaining,
      reset: new Date(resetTime),
      limit: this.maxRequests,
      used: recentRequests.length
    };
  }

  reset(key) {
    this.requests.delete(key);
  }

  resetAll() {
    this.requests.clear();
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, history] of this.requests.entries()) {
      const recentRequests = history.filter(timestamp => timestamp > windowStart);
      
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }

  getMetrics() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let totalRequests = 0;
    let activeKeys = 0;

    for (const [key, history] of this.requests.entries()) {
      const recentRequests = history.filter(timestamp => timestamp > windowStart);
      if (recentRequests.length > 0) {
        activeKeys++;
        totalRequests += recentRequests.length;
      }
    }

    return {
      activeKeys,
      totalRequests,
      averagePerKey: activeKeys > 0 ? (totalRequests / activeKeys).toFixed(2) : 0,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests
    };
  }
}

class PerAgentRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.maxRequestsPerAgent = options.maxRequestsPerAgent || 50;
    this.message = options.message || 'Agent rate limit exceeded';
    
    this.limiters = new Map(); // agentId -> RateLimiter
  }

  getOrCreateLimiter(agentId) {
    if (!this.limiters.has(agentId)) {
      this.limiters.set(agentId, new RateLimiter({
        windowMs: this.windowMs,
        maxRequests: this.maxRequestsPerAgent
      }));
    }
    return this.limiters.get(agentId);
  }

  isAllowed(agentId, requestKey = agentId) {
    const limiter = this.getOrCreateLimiter(agentId);
    return limiter.isAllowed(requestKey);
  }

  getStatus(agentId) {
    const limiter = this.getOrCreateLimiter(agentId);
    return limiter.getStatus(agentId);
  }

  getAgentStats(agentId) {
    const limiter = this.getOrCreateLimiter(agentId);
    return {
      agentId,
      ...limiter.getMetrics()
    };
  }

  getAllStats() {
    const stats = [];
    for (const [agentId, limiter] of this.limiters.entries()) {
      stats.push({
        agentId,
        ...limiter.getMetrics()
      });
    }
    return stats;
  }

  reset(agentId) {
    const limiter = this.limiters.get(agentId);
    if (limiter) {
      limiter.resetAll();
    }
  }
}

class PerAPIRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.limits = options.limits || {
      stt: { maxRequests: 30, windowMs: 60000 },
      addressParsing: { maxRequests: 100, windowMs: 60000 },
      googleMaps: { maxRequests: 20, windowMs: 60000 },
      openCage: { maxRequests: 15, windowMs: 60000 }
    };
    
    this.limiters = new Map(); // apiName -> RateLimiter
    this.initializeLimiters();
  }

  initializeLimiters() {
    for (const [apiName, config] of Object.entries(this.limits)) {
      this.limiters.set(apiName, new RateLimiter({
        windowMs: config.windowMs,
        maxRequests: config.maxRequests
      }));
    }
  }

  isAllowed(apiName, key = 'global') {
    if (!this.limiters.has(apiName)) {
      return true; // Unknown API, allow
    }

    const limiter = this.limiters.get(apiName);
    return limiter.isAllowed(key);
  }

  getStatus(apiName) {
    if (!this.limiters.has(apiName)) {
      return { apiName, error: 'Unknown API' };
    }

    return {
      apiName,
      ...this.limiters.get(apiName).getMetrics()
    };
  }

  getAllStatus() {
    const status = {};
    for (const apiName of this.limiters.keys()) {
      status[apiName] = this.getStatus(apiName);
    }
    return status;
  }

  updateLimit(apiName, maxRequests, windowMs = null) {
    if (!this.limiters.has(apiName)) {
      throw new Error(`API ${apiName} not found`);
    }

    const limiter = this.limiters.get(apiName);
    limiter.maxRequests = maxRequests;
    if (windowMs) {
      limiter.windowMs = windowMs;
    }
  }
}

class GlobalRateLimiter {
  constructor(options = {}) {
    this.agentLimiter = new PerAgentRateLimiter(options.agent || {});
    this.apiLimiter = new PerAPIRateLimiter(options.api || {});
    this.globalLimiter = new RateLimiter(options.global || {
      windowMs: 60000,
      maxRequests: 1000
    });
  }

  checkRateLimit(agentId, apiName, options = {}) {
    const globalKey = options.globalKey || 'global';

    // Check all limits
    const globalAllowed = this.globalLimiter.isAllowed(globalKey);
    const agentAllowed = this.agentLimiter.isAllowed(agentId);
    const apiAllowed = this.apiLimiter.isAllowed(apiName, agentId);

    const allowed = globalAllowed && agentAllowed && apiAllowed;

    return {
      allowed,
      global: {
        allowed: globalAllowed,
        ...this.globalLimiter.getStatus(globalKey)
      },
      agent: {
        allowed: agentAllowed,
        ...this.agentLimiter.getStatus(agentId)
      },
      api: {
        allowed: apiAllowed,
        ...this.apiLimiter.getStatus(apiName)
      }
    };
  }

  getFullStatus() {
    return {
      global: this.globalLimiter.getMetrics(),
      agents: this.agentLimiter.getAllStats(),
      apis: this.apiLimiter.getAllStatus()
    };
  }

  reset(agentId = null) {
    if (agentId) {
      this.agentLimiter.reset(agentId);
    } else {
      this.globalLimiter.resetAll();
      this.agentLimiter.resetAll();
      for (const limiter of this.apiLimiter.limiters.values()) {
        limiter.resetAll();
      }
    }
  }
}

// DDoS Protection
class DDoSProtection {
  constructor(options = {}) {
    this.suspiciousThreshold = options.suspiciousThreshold || 10; // Requests per second
    this.blockDuration = options.blockDuration || 300000; // 5 minutes
    this.blockedIPs = new Map(); // ip -> unblockTime
    this.requestCounts = new Map(); // ip -> { count, windowStart }
    this.windowSize = options.windowSize || 1000; // 1 second window
  }

  isIPBlocked(ip) {
    if (!this.blockedIPs.has(ip)) {
      return false;
    }

    const unblockTime = this.blockedIPs.get(ip);
    if (Date.now() > unblockTime) {
      this.blockedIPs.delete(ip);
      return false;
    }

    return true;
  }

  recordRequest(ip) {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    let record = this.requestCounts.get(ip);

    if (!record || record.windowStart < windowStart) {
      // New window
      record = { count: 1, windowStart: now };
    } else {
      record.count++;
    }

    this.requestCounts.set(ip, record);

    // Check if suspicious
    const requestsPerSecond = record.count / (this.windowSize / 1000);
    if (requestsPerSecond > this.suspiciousThreshold) {
      this.blockIP(ip);
      return {
        blocked: true,
        reason: `Exceeded ${this.suspiciousThreshold} req/s`,
        requestsPerSecond: requestsPerSecond.toFixed(2)
      };
    }

    return {
      blocked: false,
      requestsPerSecond: requestsPerSecond.toFixed(2)
    };
  }

  blockIP(ip) {
    const unblockTime = Date.now() + this.blockDuration;
    this.blockedIPs.set(ip, unblockTime);
    console.warn(`[DDoSProtection] Blocked IP ${ip} until ${new Date(unblockTime).toISOString()}`);
  }

  unblockIP(ip) {
    this.blockedIPs.delete(ip);
  }

  getStatus() {
    const now = Date.now();
    const activeBlocks = Array.from(this.blockedIPs.entries())
      .filter(([ip, unblockTime]) => unblockTime > now)
      .map(([ip, unblockTime]) => ({
        ip,
        unblockTime: new Date(unblockTime).toISOString()
      }));

    return {
      blockedCount: activeBlocks.length,
      blockedIPs: activeBlocks,
      suspiciousThreshold: `${this.suspiciousThreshold} req/s`,
      blockDuration: `${this.blockDuration}ms`
    };
  }

  cleanup() {
    const now = Date.now();
    
    // Clean old blocked IPs
    for (const [ip, unblockTime] of this.blockedIPs.entries()) {
      if (unblockTime < now) {
        this.blockedIPs.delete(ip);
      }
    }

    // Clean old request counts
    const windowStart = now - this.windowSize;
    for (const [ip, record] of this.requestCounts.entries()) {
      if (record.windowStart < windowStart) {
        this.requestCounts.delete(ip);
      }
    }
  }
}

// Adaptive Rate Limiting (learns from traffic patterns)
class AdaptiveRateLimiter {
  constructor(options = {}) {
    this.baseLimiter = new GlobalRateLimiter(options);
    this.metrics = {
      totalRequests: 0,
      rejectedRequests: 0,
      avgLatency: 0,
      latencies: []
    };
    this.learningWindow = options.learningWindow || 3600000; // 1 hour
    this.maxLatencyTrackSize = 1000;
  }

  checkAndRecord(agentId, apiName, latency = 0) {
    const result = this.baseLimiter.checkRateLimit(agentId, apiName);

    this.metrics.totalRequests++;
    if (!result.allowed) {
      this.metrics.rejectedRequests++;
    }

    // Track latency for optimization
    if (latency > 0) {
      this.metrics.latencies.push(latency);
      if (this.metrics.latencies.length > this.maxLatencyTrackSize) {
        this.metrics.latencies.shift();
      }

      const sum = this.metrics.latencies.reduce((a, b) => a + b, 0);
      this.metrics.avgLatency = (sum / this.metrics.latencies.length).toFixed(2);
    }

    return result;
  }

  getMetrics() {
    return {
      ...this.metrics,
      rejectionRate: this.metrics.totalRequests > 0
        ? ((this.metrics.rejectedRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  getSuggestions() {
    const suggestions = [];
    const rejectionRate = this.metrics.totalRequests > 0
      ? (this.metrics.rejectedRequests / this.metrics.totalRequests)
      : 0;

    if (rejectionRate > 0.1) {
      suggestions.push('High rejection rate (>10%). Consider increasing rate limits.');
    }

    if (this.metrics.avgLatency > 1000) {
      suggestions.push(`High average latency (${this.metrics.avgLatency}ms). Consider optimizing backend.`);
    }

    if (this.metrics.totalRequests < 100) {
      suggestions.push('Insufficient data. Monitor for at least 100 requests before adjusting limits.');
    }

    return suggestions;
  }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RateLimiter,
    PerAgentRateLimiter,
    PerAPIRateLimiter,
    GlobalRateLimiter,
    DDoSProtection,
    AdaptiveRateLimiter
  };
}
