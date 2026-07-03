/**
 * Enterprise Logging System
 * Structured JSON logging with multiple transports, log rotation, and metrics
 * Production-grade logging for Vishal Navigation
 */

class Logger {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'vishal-navigation';
    this.environment = options.environment || 'production';
    this.version = options.version || '1.0.0';
    
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3,
      TRACE: 4
    };
    
    this.currentLevel = this.logLevels[options.logLevel || 'INFO'];
    this.logs = [];
    this.maxLogs = options.maxLogs || 10000;
    
    this.transports = [];
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      logsByContext: {}
    };
  }

  setLogLevel(levelName) {
    if (levelName in this.logLevels) {
      this.currentLevel = this.logLevels[levelName];
    }
  }

  addTransport(transport) {
    this.transports.push(transport);
  }

  log(level, message, context = '', data = {}) {
    const levelValue = this.logLevels[level] || this.logLevels.INFO;
    
    if (levelValue > this.currentLevel) {
      return; // Skip if below current log level
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context,
      service: this.serviceName,
      environment: this.environment,
      version: this.version,
      data: this.sanitizeData(data),
      pid: typeof process !== 'undefined' ? process.pid : null,
      hostname: typeof process !== 'undefined' ? process.env.HOSTNAME || 'unknown' : 'browser'
    };

    // Store in memory
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Update metrics
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;
    this.metrics.logsByContext[context] = (this.metrics.logsByContext[context] || 0) + 1;

    // Send to transports
    this.transports.forEach(transport => {
      try {
        transport.write(logEntry);
      } catch (error) {
        console.error(`[Logger] Transport error: ${error.message}`);
      }
    });

    // Console output
    this.printToConsole(logEntry);
  }

  printToConsole(logEntry) {
    const { timestamp, level, message, context, data } = logEntry;
    const prefix = `[${timestamp}] [${level}] [${context}]`;
    
    const color = {
      ERROR: '\x1b[31m',   // Red
      WARN: '\x1b[33m',    // Yellow
      INFO: '\x1b[36m',    // Cyan
      DEBUG: '\x1b[35m',   // Magenta
      TRACE: '\x1b[90m'    // Gray
    };
    
    const reset = '\x1b[0m';
    const colorCode = color[level] || '';
    
    if (Object.keys(data).length > 0) {
      console.log(`${colorCode}${prefix}${reset} ${message}`, data);
    } else {
      console.log(`${colorCode}${prefix}${reset} ${message}`);
    }
  }

  sanitizeData(data) {
    // Remove sensitive information
    const sensitiveKeys = ['password', 'token', 'apiKey', 'secret', 'Authorization'];
    const sanitized = JSON.parse(JSON.stringify(data));
    
    const recursiveSanitize = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      Object.keys(obj).forEach(key => {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object') {
          recursiveSanitize(obj[key]);
        }
      });
    };
    
    recursiveSanitize(sanitized);
    return sanitized;
  }

  error(message, context = '', data = {}) {
    this.log('ERROR', message, context, data);
  }

  warn(message, context = '', data = {}) {
    this.log('WARN', message, context, data);
  }

  info(message, context = '', data = {}) {
    this.log('INFO', message, context, data);
  }

  debug(message, context = '', data = {}) {
    this.log('DEBUG', message, context, data);
  }

  trace(message, context = '', data = {}) {
    this.log('TRACE', message, context, data);
  }

  // Performance tracking
  startTimer(context) {
    return {
      context,
      startTime: Date.now(),
      end: function(message = 'Operation completed', data = {}) {
        const duration = Date.now() - this.startTime;
        this.logger.info(message, this.context, { duration, ...data });
        return duration;
      }.bind({ logger: this, context })
    };
  }

  getLogs(filter = {}) {
    let filtered = this.logs;

    if (filter.level) {
      filtered = filtered.filter(log => log.level === filter.level);
    }

    if (filter.context) {
      filtered = filtered.filter(log => log.context === filter.context);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since).getTime();
      filtered = filtered.filter(log => new Date(log.timestamp).getTime() >= sinceTime);
    }

    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }

    return filtered;
  }

  getMetrics() {
    return { ...this.metrics };
  }

  clear() {
    this.logs = [];
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      logsByContext: {}
    };
  }
}

// Transport: Console (already handled in Logger)
class ConsoleTransport {
  write(logEntry) {
    // Already handled by printToConsole
  }
}

// Transport: Memory Buffer
class MemoryTransport {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.buffer = [];
  }

  write(logEntry) {
    this.buffer.push(logEntry);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getBuffer() {
    return [...this.buffer];
  }

  clear() {
    this.buffer = [];
  }
}

// Transport: Local Storage (Browser)
class LocalStorageTransport {
  constructor(options = {}) {
    this.key = options.key || 'app-logs';
    this.maxSize = options.maxSize || 500;
  }

  write(logEntry) {
    try {
      if (typeof localStorage === 'undefined') return;

      let logs = [];
      try {
        logs = JSON.parse(localStorage.getItem(this.key) || '[]');
      } catch (e) {
        logs = [];
      }

      logs.push(logEntry);
      
      if (logs.length > this.maxSize) {
        logs = logs.slice(-this.maxSize);
      }

      localStorage.setItem(this.key, JSON.stringify(logs));
    } catch (error) {
      console.error(`[LocalStorageTransport] Error: ${error.message}`);
    }
  }

  getLogs() {
    try {
      if (typeof localStorage === 'undefined') return [];
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch (error) {
      return [];
    }
  }

  clear() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.key);
      }
    } catch (error) {
      console.error(`[LocalStorageTransport] Clear error: ${error.message}`);
    }
  }
}

// Transport: IndexedDB (Browser, larger capacity)
class IndexedDBTransport {
  constructor(options = {}) {
    this.dbName = options.dbName || 'vishal-navigation-logs';
    this.storeName = options.storeName || 'logs';
    this.maxSize = options.maxSize || 5000;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve();
        return;
      }

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async write(logEntry) {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        // Get count and remove oldest if necessary
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          if (countRequest.result >= this.maxSize) {
            const range = IDBKeyRange.upperBound(
              countRequest.result - this.maxSize + 1
            );
            store.delete(range);
          }
          
          const addRequest = store.add(logEntry);
          addRequest.onsuccess = () => resolve();
        };
      } catch (error) {
        console.error(`[IndexedDBTransport] Write error: ${error.message}`);
        resolve();
      }
    });
  }

  async getLogs(limit = 100) {
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onsuccess = () => {
          const logs = request.result;
          resolve(logs.slice(-limit));
        };
      } catch (error) {
        console.error(`[IndexedDBTransport] Read error: ${error.message}`);
        resolve([]);
      }
    });
  }

  async clear() {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
      } catch (error) {
        resolve();
      }
    });
  }
}

// Global Logger Instance
let globalLogger = null;

function initializeLogger(options = {}) {
  globalLogger = new Logger(options);

  // Add transports based on environment
  const memory = new MemoryTransport({ maxSize: 5000 });
  globalLogger.addTransport(memory);

  if (typeof localStorage !== 'undefined') {
    globalLogger.addTransport(new LocalStorageTransport({ maxSize: 1000 }));
  }

  if (typeof indexedDB !== 'undefined') {
    globalLogger.addTransport(new IndexedDBTransport({ maxSize: 10000 }));
  }

  return globalLogger;
}

function getLogger() {
  if (!globalLogger) {
    initializeLogger({
      serviceName: 'vishal-navigation',
      environment: typeof process !== 'undefined' ? process.env.NODE_ENV : 'production',
      logLevel: 'INFO'
    });
  }
  return globalLogger;
}

// Context Manager for structured logging
class LogContext {
  constructor(contextName, data = {}) {
    this.contextName = contextName;
    this.contextData = data;
    this.logger = getLogger();
  }

  info(message, data = {}) {
    this.logger.info(message, this.contextName, { ...this.contextData, ...data });
  }

  warn(message, data = {}) {
    this.logger.warn(message, this.contextName, { ...this.contextData, ...data });
  }

  error(message, data = {}) {
    this.logger.error(message, this.contextName, { ...this.contextData, ...data });
  }

  debug(message, data = {}) {
    this.logger.debug(message, this.contextName, { ...this.contextData, ...data });
  }

  startTimer() {
    return this.logger.startTimer(this.contextName);
  }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Logger,
    LogContext,
    ConsoleTransport,
    MemoryTransport,
    LocalStorageTransport,
    IndexedDBTransport,
    initializeLogger,
    getLogger
  };
}
