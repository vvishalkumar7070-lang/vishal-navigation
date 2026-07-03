/**
 * ⚡ AUTO-CONFIRMATION ON HIGH CONFIDENCE
 * Automatically stops recording and submits address when confidence >75%
 * Reduces manual interaction, enables hands-free operation for sales calls
 */

class AutoConfirmation {
  constructor() {
    this.enabled = true;
    this.confidenceThreshold = 75;
    this.debounceDelay = 1500; // ms
    this.lastConfirmTime = 0;
  }

  /**
   * Check if result should auto-confirm
   * @param {Object} result - Address extraction result with confidence score
   * @returns {boolean} - True if should auto-confirm
   */
  shouldConfirm(result) {
    if (!this.enabled || !result) return false;
    
    // Debounce rapid confirmations
    const now = Date.now();
    if (now - this.lastConfirmTime < this.debounceDelay) {
      return false;
    }

    // Check confidence threshold
    const confidence = result.confidence || 0;
    const isComplete = result.is_complete !== false;
    
    return confidence >= this.confidenceThreshold && isComplete;
  }

  /**
   * Execute auto-confirmation workflow
   * 1. Stop audio recording
   * 2. Show confidence score
   * 3. Auto-submit to backend
   * 4. Display results in <300ms
   */
  async execute(result, callbacks = {}) {
    this.lastConfirmTime = Date.now();

    // 1. Stop recording immediately
    if (callbacks.stopRecording) {
      callbacks.stopRecording();
    }

    // 2. Show visual confirmation
    if (callbacks.showConfidence) {
      callbacks.showConfidence(result.confidence);
    }

    // 3. Auto-submit (non-blocking)
    if (callbacks.submitAddress) {
      try {
        await callbacks.submitAddress(result);
      } catch (err) {
        console.error('Auto-submit failed:', err);
        if (callbacks.showError) {
          callbacks.showError(err.message);
        }
      }
    }

    // 4. Show results instantly
    if (callbacks.showResults) {
      callbacks.showResults(result);
    }
  }

  setThreshold(percentage) {
    this.confidenceThreshold = Math.max(0, Math.min(100, percentage));
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }
}

window.autoConfirm = new AutoConfirmation();
