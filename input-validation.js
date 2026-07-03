/**
 * Enterprise Input Validation & Sanitization
 * Comprehensive security layer for all user inputs
 * Prevents XSS, SQL injection, and malformed data
 */

class InputValidator {
  constructor(options = {}) {
    this.strictMode = options.strictMode !== false;
    this.maxInputLength = options.maxInputLength || 10000;
    this.allowedOrigins = options.allowedOrigins || ['localhost', 'vishal-navigation'];
  }

  // Text Validation
  validateText(input, options = {}) {
    const {
      minLength = 0,
      maxLength = this.maxInputLength,
      pattern = null,
      allowEmpty = false,
      allowSpecialChars = false
    } = options;

    if (typeof input !== 'string') {
      throw new ValidationError('Input must be a string', 'text');
    }

    const trimmed = input.trim();

    if (trimmed.length === 0 && !allowEmpty) {
      throw new ValidationError('Input cannot be empty', 'text');
    }

    if (trimmed.length < minLength) {
      throw new ValidationError(`Input must be at least ${minLength} characters`, 'text');
    }

    if (trimmed.length > maxLength) {
      throw new ValidationError(`Input exceeds maximum length of ${maxLength}`, 'text');
    }

    if (pattern && !pattern.test(trimmed)) {
      throw new ValidationError(`Input does not match required pattern: ${pattern}`, 'text');
    }

    if (!allowSpecialChars && this.containsDangerousChars(trimmed)) {
      throw new ValidationError('Input contains forbidden special characters', 'text');
    }

    return trimmed;
  }

  // Address Validation (Hindi/English support)
  validateAddress(input, options = {}) {
    const {
      minLength = 10,
      maxLength = 500,
      allowHindi = true,
      allowNumbers = true
    } = options;

    const address = this.validateText(input, { minLength, maxLength, allowEmpty: false });

    // Check for SQL injection patterns
    if (this.containsSQLInjectionPatterns(address)) {
      throw new ValidationError('Input contains potential SQL injection patterns', 'address');
    }

    // Allow alphanumeric + spaces + common address chars + Hindi
    const addressPattern = allowHindi
      ? /^[\w\s,.\-/#()\u0900-\u097F]+$/u
      : /^[a-zA-Z0-9\s,.\-/#()]+$/;

    if (!addressPattern.test(address)) {
      throw new ValidationError('Address contains invalid characters', 'address');
    }

    return address;
  }

  // Phone Number Validation (Indian format)
  validatePhoneNumber(input) {
    const cleaned = String(input).replace(/\D/g, '');

    // Accept 10-digit Indian numbers or 12-digit with country code
    if (!/^(\d{10}|\d{12})$/.test(cleaned)) {
      throw new ValidationError('Invalid phone number format (expected 10 or 12 digits)', 'phone');
    }

    // If 12 digits, should start with 91 (India)
    if (cleaned.length === 12 && !cleaned.startsWith('91')) {
      throw new ValidationError('Invalid country code (expected 91 for India)', 'phone');
    }

    return cleaned.slice(-10); // Return last 10 digits
  }

  // Pincode Validation (Indian)
  validatePincode(input) {
    const pincode = String(input).replace(/\D/g, '');

    if (!/^\d{6}$/.test(pincode)) {
      throw new ValidationError('Invalid pincode (must be 6 digits)', 'pincode');
    }

    // Basic range check: Indian pincodes are typically 100000-999999
    const pin = parseInt(pincode, 10);
    if (pin < 100000 || pin > 999999) {
      throw new ValidationError('Pincode out of valid Indian range', 'pincode');
    }

    return pincode;
  }

  // Email Validation
  validateEmail(input) {
    const email = this.validateText(input, { minLength: 5, maxLength: 254 }).toLowerCase();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      throw new ValidationError('Invalid email format', 'email');
    }

    return email;
  }

  // URL Validation
  validateURL(input) {
    const urlStr = this.validateText(input, { minLength: 10, maxLength: 2048 });

    try {
      const url = new URL(urlStr);
      
      // Whitelist allowed protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new ValidationError('Only http and https protocols are allowed', 'url');
      }

      // Check for localhost in production
      if (this.strictMode && url.hostname === 'localhost') {
        throw new ValidationError('Localhost URLs not allowed in strict mode', 'url');
      }

      return urlStr;
    } catch (error) {
      throw new ValidationError('Invalid URL format', 'url');
    }
  }

  // Language Code Validation
  validateLanguageCode(input) {
    const code = String(input).toLowerCase().trim();

    const validLanguages = ['en', 'hi', 'ta', 'te', 'ka', 'ml', 'bn', 'gu', 'mr', 'pa'];
    if (!validLanguages.includes(code)) {
      throw new ValidationError(`Invalid language code. Allowed: ${validLanguages.join(', ')}`, 'language');
    }

    return code;
  }

  // Confidence Score Validation
  validateConfidenceScore(input) {
    const score = parseFloat(input);

    if (isNaN(score)) {
      throw new ValidationError('Confidence score must be a number', 'confidence');
    }

    if (score < 0 || score > 1) {
      throw new ValidationError('Confidence score must be between 0 and 1', 'confidence');
    }

    return score;
  }

  // Generic Object Validation
  validateObject(input, schema) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new ValidationError('Input must be a valid object', 'object');
    }

    const validated = {};

    for (const [key, rule] of Object.entries(schema)) {
      if (rule.required && !(key in input)) {
        throw new ValidationError(`Required field missing: ${key}`, key);
      }

      if (key in input) {
        const validator = rule.validator;
        try {
          validated[key] = validator(input[key], rule.options);
        } catch (error) {
          throw new ValidationError(`Field validation failed: ${error.message}`, key);
        }
      } else if ('default' in rule) {
        validated[key] = rule.default;
      }
    }

    return validated;
  }

  // Sanitization Methods
  sanitizeHTML(input) {
    if (typeof input !== 'string') return input;

    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  sanitizeJSON(input) {
    if (typeof input !== 'string') return input;

    try {
      // Parse and re-stringify to remove potential injection vectors
      const parsed = JSON.parse(input);
      return JSON.stringify(parsed);
    } catch (error) {
      throw new ValidationError('Invalid JSON format', 'json');
    }
  }

  sanitizeCSV(input) {
    if (typeof input !== 'string') return input;

    // Remove potential formula injection
    const dangerous = ['=', '+', '-', '@'];
    if (dangerous.some(char => input.startsWith(char))) {
      return `'${input}`; // Prefix with quote to prevent formula execution
    }

    return input;
  }

  // Helper Methods
  containsDangerousChars(input) {
    const dangerousPattern = /[<>\"'`;\\/]/;
    return dangerousPattern.test(input);
  }

  containsSQLInjectionPatterns(input) {
    const sqlPatterns = [
      /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
      /('|")\s*(OR|AND)\s*('|")/i,
      /;\s*(DROP|DELETE|UPDATE)/i,
      /\/\*.*?\*\//,
      /--/
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  containsXSSPatterns(input) {
    const xssPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /on\w+\s*=/gi,
      /javascript:/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  // CSV validation for batch operations
  validateCSVLine(line, expectedColumns) {
    const columns = line.split(',').map(col => col.trim());

    if (columns.length !== expectedColumns) {
      throw new ValidationError(
        `Expected ${expectedColumns} columns, got ${columns.length}`,
        'csv'
      );
    }

    return columns;
  }

  // Address extraction result validation
  validateAddressExtractionResult(result) {
    const schema = {
      address: {
        required: true,
        validator: (val) => this.validateAddress(val)
      },
      confidence: {
        required: true,
        validator: (val) => this.validateConfidenceScore(val)
      },
      language: {
        required: false,
        validator: (val) => this.validateLanguageCode(val),
        default: 'en'
      },
      pincode: {
        required: false,
        validator: (val) => this.validatePincode(val)
      },
      phone: {
        required: false,
        validator: (val) => this.validatePhoneNumber(val)
      }
    };

    return this.validateObject(result, schema);
  }

  // Verification result validation
  validateVerificationResult(result) {
    const schema = {
      isValid: {
        required: true,
        validator: (val) => {
          if (typeof val !== 'boolean') throw new Error('Must be boolean');
          return val;
        }
      },
      latitude: {
        required: false,
        validator: (val) => {
          const num = parseFloat(val);
          if (isNaN(num) || num < -90 || num > 90) throw new Error('Invalid latitude');
          return num;
        }
      },
      longitude: {
        required: false,
        validator: (val) => {
          const num = parseFloat(val);
          if (isNaN(num) || num < -180 || num > 180) throw new Error('Invalid longitude');
          return num;
        }
      },
      source: {
        required: false,
        validator: (val) => this.validateText(val, { minLength: 1, maxLength: 50 }),
        default: 'google-maps'
      }
    };

    return this.validateObject(result, schema);
  }
}

// Custom Error Class (if not imported from error-handling.js)
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// Batch Validator for multiple inputs
class BatchValidator {
  constructor(validator) {
    this.validator = validator;
    this.results = [];
    this.errors = [];
  }

  validateBatch(inputs, validatorFn) {
    this.results = [];
    this.errors = [];

    inputs.forEach((input, index) => {
      try {
        const result = validatorFn(input);
        this.results.push({
          index,
          input,
          result,
          valid: true
        });
      } catch (error) {
        this.errors.push({
          index,
          input,
          error: error.message,
          valid: false
        });
      }
    });

    return {
      total: inputs.length,
      valid: this.results.length,
      invalid: this.errors.length,
      results: this.results,
      errors: this.errors
    };
  }

  getSuccessRate() {
    const total = this.results.length + this.errors.length;
    return total === 0 ? 0 : (this.results.length / total) * 100;
  }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    InputValidator,
    ValidationError,
    BatchValidator
  };
}
