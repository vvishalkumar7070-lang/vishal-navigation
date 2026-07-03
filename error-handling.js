/**
 * Enterprise Error Handling Module
 * Implements retry logic, exponential backoff, circuit breaker pattern
 * For: Speech-to-text, address parsing, Google Maps verification
 */

class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelayMs = options.initialDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 5000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitterFraction = options.jitterFraction || 0.1;
  }

  getDelayMs(attemptNumber) {
    // Exponential backoff: delay = initialDelay * (multiplier ^ attempt)
    let delay = Math.min(
      this.initialDelayMs * Math.pow(this.backoffMultiplier, attemptNumber),
      this.maxDelayMs
    );

    // Add jitter to prevent thundering herd
    const jitter = delay * this.jitterFraction * Math.random();
    return Math.floor(delay + jitter);
  }

  async execute(fn, context = '') {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < this.maxRetries - 1) {
          const delayMs = this.getDelayMs(attempt);
          console.warn(
            `[RetryPolicy] Attempt ${attempt + 1}/${this.maxRetries} failed for "${context}". ` +
            `Retrying in ${delayMs}ms. Error: ${error.message}`
          );
          await this.sleep(delayMs);
        }
      }
    }

    throw new RetryExhaustedError(
      `All ${this.maxRetries} retry attempts failed for "${context}": ${lastError.message}`,
      lastError
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeoutMs = options.timeoutMs || 60000; // 1 minute
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = null;
    this.lastError = null;
  }

  async execute(fn, context = '') {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker OPEN for "${context}". Will retry at ${new Date(this.nextAttemptTime).toISOString()}`,
          this.lastError
        );
      }
      // Try half-open
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(context, error);
      throw error;
    }
  }

  onSuccess(context) {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        console.info(`[CircuitBreaker] "${context}" - Transitioning from HALF_OPEN to CLOSED`);
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  onFailure(context, error) {
    this.lastError = error;
    this.failureCount++;

    if (this.state === 'HALF_OPEN') {
      console.warn(`[CircuitBreaker] "${context}" - Failed in HALF_OPEN. Reopening circuit.`);
      this.openCircuit();
    } else if (this.failureCount >= this.failureThreshold) {
      console.error(
        `[CircuitBreaker] "${context}" - Failure threshold reached (${this.failureCount}/${this.failureThreshold}). Opening circuit.`
      );
      this.openCircuit();
    }
  }

  openCircuit() {
    this.state = 'OPEN';
    this.nextAttemptTime = Date.now() + this.timeoutMs;
    console.error(
      `[CircuitBreaker] Circuit opened. Will attempt recovery at ${new Date(this.nextAttemptTime).toISOString()}`
    );
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null,
      lastError: this.lastError ? this.lastError.message : null
    };
  }
}

class ErrorHandler {
  constructor(options = {}) {
    this.retryPolicy = options.retryPolicy || new RetryPolicy();
    this.circuitBreakers = new Map();
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByContext: {}
    };
  }

  getOrCreateCircuitBreaker(context, options = {}) {
    if (!this.circuitBreakers.has(context)) {
      this.circuitBreakers.set(context, new CircuitBreaker(options));
    }
    return this.circuitBreakers.get(context);
  }

  async executeWithProtection(fn, context = '', options = {}) {
    const retryPolicy = options.retryPolicy || this.retryPolicy;
    const circuitBreaker = this.getOrCreateCircuitBreaker(context, options.circuitBreaker);

    try {
      return await circuitBreaker.execute(async () => {
        return await retryPolicy.execute(fn, context);
      }, context);
    } catch (error) {
      this.recordError(error, context);
      throw error;
    }
  }

  recordError(error, context) {
    this.errorMetrics.totalErrors++;

    const errorType = error.constructor.name;
    this.errorMetrics.errorsByType[errorType] = (this.errorMetrics.errorsByType[errorType] || 0) + 1;
    this.errorMetrics.errorsByContext[context] = (this.errorMetrics.errorsByContext[context] || 0) + 1;
  }

  getMetrics() {
    return {
      ...this.errorMetrics,
      circuitBreakerStatus: Array.from(this.circuitBreakers.entries()).reduce((acc, [context, cb]) => {
        acc[context] = cb.getStatus();
        return acc;
      }, {})
    };
  }

  reset() {
    this.errorMetrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByContext: {}
    };
    this.circuitBreakers.forEach(cb => {
      cb.state = 'CLOSED';
      cb.failureCount = 0;
      cb.successCount = 0;
    });
  }
}

// Custom Error Classes
class RetryExhaustedError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'RetryExhaustedError';
    this.originalError = originalError;
  }
}

class CircuitBreakerOpenError extends Error {
  constructor(message, lastError) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.lastError = lastError;
  }
}

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// Usage Examples & Integration Points
const RETRY_POLICIES = {
  stt: new RetryPolicy({
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 3000,
    backoffMultiplier: 2
  }),
  
  addressParsing: new RetryPolicy({
    maxRetries: 2,
    initialDelayMs: 50,
    maxDelayMs: 500,
    backoffMultiplier: 1.5
  }),
  
  verification: new RetryPolicy({
    maxRetries: 3,
    initialDelayMs: 200,
    maxDelayMs: 5000,
    backoffMultiplier: 2
  })
};

const CIRCUIT_BREAKER_CONFIG = {
  stt: {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 30000
  },
  
  googleMaps: {
    failureThreshold: 3,
    successThreshold: 1,
    timeoutMs: 60000
  },
  
  openCage: {
    failureThreshold: 4,
    successThreshold: 2,
    timeoutMs: 45000
  }
};

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ErrorHandler,
    RetryPolicy,
    CircuitBreaker,
    RetryExhaustedError,
    CircuitBreakerOpenError,
    ValidationError,
    RateLimitError,
    RETRY_POLICIES,
    CIRCUIT_BREAKER_CONFIG
  };
}
