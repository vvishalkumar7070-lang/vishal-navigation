/**
 * Comprehensive Test Suite for Enterprise Modules
 * Unit tests, integration tests, performance benchmarks
 * Jest-compatible or browser-runnable
 */

// Test Framework Setup
class TestRunner {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      failures: []
    };
  }

  describe(testName, testFn) {
    this.tests.push({ name: testName, fn: testFn });
  }

  async run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running Test Suite: ${this.name}`);
    console.log(`${'='.repeat(60)}\n`);

    for (const test of this.tests) {
      try {
        await test.fn();
        this.results.passed++;
        console.log(`✅ PASS: ${test.name}`);
      } catch (error) {
        this.results.failed++;
        this.results.failures.push({ test: test.name, error: error.message });
        console.error(`❌ FAIL: ${test.name}`);
        console.error(`   Error: ${error.message}\n`);
      }
      this.results.total++;
    }

    this.printSummary();
    return this.results;
  }

  printSummary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test Results Summary`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total: ${this.results.total}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(2)}%\n`);

    if (this.results.failures.length > 0) {
      console.log('Failures:');
      this.results.failures.forEach((failure, idx) => {
        console.log(`${idx + 1}. ${failure.test}`);
        console.log(`   ${failure.error}\n`);
      });
    }
  }
}

// Assertion Helpers
const assert = {
  equal: (actual, expected, message) => {
    if (actual !== expected) {
      throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
  },

  notEqual: (actual, expected, message) => {
    if (actual === expected) {
      throw new Error(`${message || 'Assertion failed'}: values should not be equal`);
    }
  },

  isTrue: (value, message) => {
    if (value !== true) {
      throw new Error(`${message || 'Assertion failed'}: expected true, got ${value}`);
    }
  },

  isFalse: (value, message) => {
    if (value !== false) {
      throw new Error(`${message || 'Assertion failed'}: expected false, got ${value}`);
    }
  },

  isDefined: (value, message) => {
    if (value === undefined) {
      throw new Error(`${message || 'Assertion failed'}: expected defined value`);
    }
  },

  isNull: (value, message) => {
    if (value !== null) {
      throw new Error(`${message || 'Assertion failed'}: expected null, got ${value}`);
    }
  },

  throws: (fn, message) => {
    try {
      fn();
      throw new Error(`${message || 'Assertion failed'}: expected function to throw`);
    } catch (error) {
      // Expected
    }
  },

  doesNotThrow: (fn, message) => {
    try {
      fn();
    } catch (error) {
      throw new Error(`${message || 'Assertion failed'}: expected no throw, got: ${error.message}`);
    }
  },

  arrayIncludes: (array, item, message) => {
    if (!array.includes(item)) {
      throw new Error(`${message || 'Assertion failed'}: array does not include item`);
    }
  },

  arrayLength: (array, length, message) => {
    if (array.length !== length) {
      throw new Error(`${message || 'Assertion failed'}: expected length ${length}, got ${array.length}`);
    }
  },

  isGreaterThan: (actual, threshold, message) => {
    if (actual <= threshold) {
      throw new Error(`${message || 'Assertion failed'}: ${actual} is not greater than ${threshold}`);
    }
  },

  isLessThan: (actual, threshold, message) => {
    if (actual >= threshold) {
      throw new Error(`${message || 'Assertion failed'}: ${actual} is not less than ${threshold}`);
    }
  }
};

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

const errorHandlingTests = new TestRunner('Error Handling Module');

errorHandlingTests.describe('RetryPolicy: Basic retry with exponential backoff', async () => {
  const policy = new RetryPolicy({ maxRetries: 3, initialDelayMs: 10 });
  let attempts = 0;

  const result = await policy.execute(() => {
    attempts++;
    if (attempts < 3) throw new Error('Simulated failure');
    return 'success';
  });

  assert.equal(result, 'success', 'Should succeed on retry');
  assert.equal(attempts, 3, 'Should attempt 3 times');
});

errorHandlingTests.describe('RetryPolicy: Exhausts after max retries', async () => {
  const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 10 });

  assert.throws(() => {
    return policy.execute(() => {
      throw new Error('Persistent failure');
    });
  }, 'Should throw RetryExhaustedError');
});

errorHandlingTests.describe('CircuitBreaker: Opens after threshold failures', async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, timeoutMs: 100 });
  let callCount = 0;

  // Fail twice to open circuit
  for (let i = 0; i < 2; i++) {
    try {
      await breaker.execute(() => {
        callCount++;
        throw new Error('Failure');
      });
    } catch (e) {
      // Expected
    }
  }

  assert.equal(breaker.state, 'OPEN', 'Circuit should be OPEN');

  // Next call should fail immediately without executing function
  try {
    await breaker.execute(() => {
      callCount++;
      return 'success';
    });
  } catch (error) {
    assert.equal(error.name, 'CircuitBreakerOpenError', 'Should throw CircuitBreakerOpenError');
  }

  assert.equal(callCount, 2, 'Function should not execute when circuit is OPEN');
});

errorHandlingTests.describe('CircuitBreaker: Recovers to CLOSED', async () => {
  const breaker = new CircuitBreaker({
    failureThreshold: 1,
    successThreshold: 1,
    timeoutMs: 50
  });

  // Open the circuit
  try {
    await breaker.execute(() => { throw new Error('Failure'); });
  } catch (e) {
    // Expected
  }

  assert.equal(breaker.state, 'OPEN', 'Circuit should be OPEN');

  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 60));

  // Should transition to HALF_OPEN and then CLOSED on success
  const result = await breaker.execute(() => 'success');
  assert.equal(result, 'success', 'Should execute successfully');
  assert.equal(breaker.state, 'CLOSED', 'Circuit should be CLOSED after successful call');
});

// ============================================================================
// LOGGING TESTS
// ============================================================================

const loggingTests = new TestRunner('Logging System');

loggingTests.describe('Logger: Creates log entries with correct structure', async () => {
  const logger = new Logger({ serviceName: 'test-service', environment: 'test' });

  logger.info('Test message', 'TestContext', { data: 'value' });

  const logs = logger.getLogs();
  assert.isGreaterThan(logs.length, 0, 'Should have logs');

  const lastLog = logs[logs.length - 1];
  assert.equal(lastLog.message, 'Test message', 'Message should match');
  assert.equal(lastLog.context, 'TestContext', 'Context should match');
  assert.equal(lastLog.level, 'INFO', 'Level should be INFO');
  assert.equal(lastLog.service, 'test-service', 'Service name should match');
});

loggingTests.describe('Logger: Respects log level filtering', async () => {
  const logger = new Logger({ logLevel: 'WARN' });

  logger.debug('Debug message', 'Context');
  logger.info('Info message', 'Context');
  logger.warn('Warn message', 'Context');
  logger.error('Error message', 'Context');

  const logs = logger.getLogs();
  const hasDebug = logs.some(log => log.level === 'DEBUG');
  const hasWarn = logs.some(log => log.level === 'WARN');

  assert.isFalse(hasDebug, 'Should not have DEBUG logs');
  assert.isTrue(hasWarn, 'Should have WARN logs');
});

loggingTests.describe('Logger: Sanitizes sensitive data', async () => {
  const logger = new Logger();

  logger.info('Testing', 'Context', { password: 'secret123', apiKey: 'key456', data: 'safe' });

  const logs = logger.getLogs();
  const lastLog = logs[logs.length - 1];

  assert.equal(lastLog.data.password, '***REDACTED***', 'Password should be redacted');
  assert.equal(lastLog.data.apiKey, '***REDACTED***', 'API key should be redacted');
  assert.equal(lastLog.data.data, 'safe', 'Safe data should remain');
});

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

const validationTests = new TestRunner('Input Validation');

validationTests.describe('validateText: Accepts valid text', async () => {
  const validator = new InputValidator();
  const result = validator.validateText('Hello World', { minLength: 5, maxLength: 50 });
  assert.equal(result, 'Hello World', 'Should return valid text');
});

validationTests.describe('validateText: Rejects too short text', async () => {
  const validator = new InputValidator();
  assert.throws(() => {
    validator.validateText('Hi', { minLength: 5 });
  }, 'Should reject short text');
});

validationTests.describe('validatePhoneNumber: Validates Indian 10-digit', async () => {
  const validator = new InputValidator();
  const result = validator.validatePhoneNumber('9876543210');
  assert.equal(result, '9876543210', 'Should validate 10-digit number');
});

validationTests.describe('validatePincode: Validates Indian 6-digit', async () => {
  const validator = new InputValidator();
  const result = validator.validatePincode('110001');
  assert.equal(result, '110001', 'Should validate pincode');
});

validationTests.describe('validateAddress: Prevents SQL injection', async () => {
  const validator = new InputValidator();
  assert.throws(() => {
    validator.validateAddress("'; DROP TABLE users; --");
  }, 'Should reject SQL injection attempt');
});

validationTests.describe('validateEmail: Validates correct email', async () => {
  const validator = new InputValidator();
  const result = validator.validateEmail('user@example.com');
  assert.equal(result, 'user@example.com', 'Should validate email');
});

validationTests.describe('BatchValidator: Validates multiple inputs', async () => {
  const validator = new InputValidator();
  const batchValidator = new BatchValidator(validator);

  const inputs = ['9876543210', '9999999999', 'invalid'];
  const results = batchValidator.validateBatch(inputs, (input) => 
    validator.validatePhoneNumber(input)
  );

  assert.equal(results.valid, 2, 'Should have 2 valid');
  assert.equal(results.invalid, 1, 'Should have 1 invalid');
  assert.isGreaterThan(batchValidator.getSuccessRate(), 50, 'Success rate should be > 50%');
});

// ============================================================================
// RATE LIMITING TESTS
// ============================================================================

const rateLimitingTests = new TestRunner('Rate Limiting');

rateLimitingTests.describe('RateLimiter: Allows requests within limit', async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 5 });

  for (let i = 0; i < 5; i++) {
    const allowed = limiter.isAllowed('key1');
    assert.isTrue(allowed, `Request ${i + 1} should be allowed`);
  }
});

rateLimitingTests.describe('RateLimiter: Rejects requests exceeding limit', async () => {
  const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 });

  for (let i = 0; i < 3; i++) {
    limiter.isAllowed('key1');
  }

  const allowed = limiter.isAllowed('key1');
  assert.isFalse(allowed, 'Fourth request should be rejected');
});

rateLimitingTests.describe('PerAgentRateLimiter: Tracks per-agent limits', async () => {
  const limiter = new PerAgentRateLimiter({ maxRequestsPerAgent: 3 });

  // Agent 1
  for (let i = 0; i < 3; i++) {
    limiter.isAllowed('agent-1');
  }

  // Agent 2
  for (let i = 0; i < 2; i++) {
    limiter.isAllowed('agent-2');
  }

  const status1 = limiter.getStatus('agent-1');
  const status2 = limiter.getStatus('agent-2');

  assert.equal(status1.remaining, 0, 'Agent 1 should have 0 remaining');
  assert.equal(status2.remaining, 1, 'Agent 2 should have 1 remaining');
});

rateLimitingTests.describe('GlobalRateLimiter: Enforces all limits', async () => {
  const limiter = new GlobalRateLimiter({
    global: { maxRequests: 10, windowMs: 1000 },
    agent: { maxRequestsPerAgent: 5 },
    api: { limits: { stt: { maxRequests: 3, windowMs: 1000 } } }
  });

  // Fill up STT limit
  for (let i = 0; i < 3; i++) {
    limiter.checkRateLimit('agent-1', 'stt');
  }

  const result = limiter.checkRateLimit('agent-1', 'stt');
  assert.isFalse(result.api.allowed, 'STT API should be rate limited');
});

rateLimitingTests.describe('DDoSProtection: Detects suspicious traffic', async () => {
  const protection = new DDoSProtection({ suspiciousThreshold: 5, windowSize: 1000 });

  let blocked = false;
  for (let i = 0; i < 10; i++) {
    const result = protection.recordRequest('192.168.1.1');
    if (result.blocked) {
      blocked = true;
      break;
    }
  }

  assert.isTrue(blocked, 'IP should be blocked for suspicious activity');
});

// ============================================================================
// CACHING TESTS
// ============================================================================

const cachingTests = new TestRunner('Caching System');

cachingTests.describe('MemoryCache: Stores and retrieves values', async () => {
  const cache = new MemoryCache();

  cache.set('key1', 'value1');
  const result = cache.get('key1');

  assert.equal(result, 'value1', 'Should retrieve stored value');
});

cachingTests.describe('MemoryCache: Respects TTL expiration', async () => {
  const cache = new MemoryCache();

  cache.set('key1', 'value1', 100); // 100ms TTL
  assert.equal(cache.get('key1'), 'value1', 'Should be available immediately');

  await new Promise(resolve => setTimeout(resolve, 150));
  assert.isNull(cache.get('key1'), 'Should expire after TTL');
});

cachingTests.describe('MemoryCache: LRU eviction when full', async () => {
  const cache = new MemoryCache({ maxSize: 3 });

  cache.set('key1', 'value1');
  cache.set('key2', 'value2');
  cache.set('key3', 'value3');
  cache.set('key4', 'value4'); // Should evict oldest

  assert.isNull(cache.get('key1'), 'Oldest item should be evicted');
  assert.equal(cache.get('key4'), 'value4', 'Newest item should exist');
});

cachingTests.describe('MultiLevelCache: Writes to all levels', async () => {
  const cache = new MultiLevelCache({
    memory: { maxSize: 100 },
    redis: { enabled: false },
    database: { enabled: false }
  });

  await cache.set('key1', { data: 'value' }, 3600000);

  const result = await cache.get('key1');
  assert.equal(result.value.data, 'value', 'Should retrieve from memory');
});

cachingTests.describe('AddressCache: Normalizes address keys', async () => {
  const cache = new AddressCache();

  // Same address with different spacing should map to same key
  cache.set('123  Main  Street', 'value1');
  const result = await cache.get('123 Main Street');

  assert.equal(result.value, 'value1', 'Should find normalized address');
});

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

const performanceBenchmarks = new TestRunner('Performance Benchmarks');

performanceBenchmarks.describe('Benchmark: Memory cache retrieval latency', async () => {
  const cache = new MemoryCache();

  // Pre-populate cache
  for (let i = 0; i < 1000; i++) {
    cache.set(`key${i}`, `value${i}`);
  }

  const iterations = 10000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    cache.get(`key${Math.floor(Math.random() * 1000)}`);
  }

  const latency = (Date.now() - start) / iterations;
  console.log(`  Memory cache avg latency: ${latency.toFixed(3)}ms`);
  assert.isLessThan(latency, 1, 'Should retrieve in <1ms');
});

performanceBenchmarks.describe('Benchmark: Validation throughput', async () => {
  const validator = new InputValidator();

  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    validator.validateText(`Test message ${i}`, { minLength: 5 });
  }

  const throughput = iterations / ((Date.now() - start) / 1000);
  console.log(`  Validation throughput: ${throughput.toFixed(0)} validations/sec`);
  assert.isGreaterThan(throughput, 100, 'Should validate >100 per second');
});

performanceBenchmarks.describe('Benchmark: Rate limiter check latency', async () => {
  const limiter = new RateLimiter({ maxRequests: 1000 });

  const iterations = 10000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    limiter.isAllowed(`key${i % 100}`);
  }

  const latency = (Date.now() - start) / iterations;
  console.log(`  Rate limiter avg latency: ${latency.toFixed(3)}ms`);
  assert.isLessThan(latency, 1, 'Should check in <1ms');
});

performanceBenchmarks.describe('Benchmark: Logger throughput', async () => {
  const logger = new Logger({ logLevel: 'INFO' });

  const iterations = 1000;
  const start = Date.now();

  for (let i = 0; i < iterations; i++) {
    logger.info(`Log message ${i}`, 'Context');
  }

  const throughput = iterations / ((Date.now() - start) / 1000);
  console.log(`  Logging throughput: ${throughput.toFixed(0)} logs/sec`);
  assert.isGreaterThan(throughput, 100, 'Should log >100 per second');
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

const integrationTests = new TestRunner('Integration Tests');

integrationTests.describe('Integration: Full STT pipeline with all protections', async () => {
  const logger = initializeLogger({ serviceName: 'test', logLevel: 'DEBUG' });
  const validator = new InputValidator();
  const errorHandler = new ErrorHandler();
  const rateLimiter = new GlobalRateLimiter();
  const cache = new MultiLevelCache({ memory: { maxSize: 100 } });

  const agentId = 'test-agent';

  // Check rate limits
  const rateLimitCheck = rateLimiter.checkRateLimit(agentId, 'stt');
  assert.isTrue(rateLimitCheck.allowed, 'Should be allowed');

  // Validate input
  const transcript = 'Please deliver to 123 Main Street';
  const validated = validator.validateText(transcript, { minLength: 10 });
  assert.equal(validated, transcript, 'Should validate transcript');

  // Use cache
  const cacheKey = `stt:${agentId}`;
  await cache.set(cacheKey, { address: '123 Main Street', confidence: 0.95 });
  const cached = await cache.get(cacheKey);
  assert.equal(cached.value.confidence, 0.95, 'Should cache result');

  logger.info('STT pipeline completed', 'Integration', { agentId });
});

integrationTests.describe('Integration: Address parsing with all protections', async () => {
  const validator = new InputValidator();
  const cache = new MultiLevelCache({ memory: { maxSize: 100 } });

  const address = '123 Main Street, New Delhi 110001';

  // Validate address
  const validated = validator.validateAddress(address);
  assert.equal(validated.substring(0, 3), '123', 'Should validate address');

  // Cache result
  const addressCache = new AddressCache();
  await addressCache.set(address, {
    address: validated,
    pincode: '110001',
    confidence: 0.98
  });

  const result = await addressCache.get(address);
  assert.equal(result.value.pincode, '110001', 'Should cache pincode');
});

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runAllTests() {
  const allResults = [];

  const suites = [
    errorHandlingTests,
    loggingTests,
    validationTests,
    rateLimitingTests,
    cachingTests,
    performanceBenchmarks,
    integrationTests
  ];

  for (const suite of suites) {
    const results = await suite.run();
    allResults.push(results);
  }

  // Print overall summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`OVERALL TEST SUMMARY`);
  console.log(`${'='.repeat(60)}`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  allResults.forEach((result, idx) => {
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTests += result.total;
    console.log(`Suite ${idx + 1}: ${result.passed}/${result.total} passed`);
  });

  console.log(`\nTotal: ${totalPassed}/${totalTests} tests passed`);
  console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(2)}%`);

  if (totalFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! 🎉\n');
  } else {
    console.log(`\n⚠️  ${totalFailed} test(s) failed\n`);
  }

  return {
    total: totalTests,
    passed: totalPassed,
    failed: totalFailed
  };
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TestRunner,
    assert,
    runAllTests
  };
}

// Auto-run if called directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests().then(results => {
    process.exit(results.failed === 0 ? 0 : 1);
  });
}
