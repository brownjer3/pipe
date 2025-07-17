// Analytics and tracking for Pipe landing page
class PipeAnalytics {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.userId = this.getUserId();
    this.pageLoadTime = performance.now();
    this.initializeTracking();
  }

  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getUserId() {
    // Check for existing user ID in localStorage
    let userId = localStorage.getItem('pipe_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('pipe_user_id', userId);
    }
    return userId;
  }

  initializeTracking() {
    // Track page load
    this.track('Landing Page View', {
      page: window.location.pathname,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      loadTime: Math.round(this.pageLoadTime),
    });

    // Track scroll depth
    this.setupScrollTracking();

    // Track click events
    this.setupClickTracking();

    // Track form interactions
    this.setupFormTracking();

    // Track page exit
    this.setupExitTracking();
  }

  track(event, properties = {}) {
    const eventData = {
      event,
      properties: {
        ...properties,
        sessionId: this.sessionId,
        userId: this.userId,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
    };

    // Send to backend
    this.sendToBackend(eventData);

    // Send to Google Analytics if available
    if (typeof gtag !== 'undefined') {
      gtag('event', event, properties);
    }

    // Console log in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('Analytics Event:', eventData);
    }
  }

  sendToBackend(data) {
    fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }).catch((error) => {
      console.error('Analytics tracking failed:', error);
    });
  }

  setupScrollTracking() {
    let maxScroll = 0;
    const scrollThresholds = [25, 50, 75, 100];
    const triggeredThresholds = new Set();

    window.addEventListener('scroll', () => {
      const scrollPercent = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );

      maxScroll = Math.max(maxScroll, scrollPercent);

      // Track scroll milestones
      scrollThresholds.forEach((threshold) => {
        if (scrollPercent >= threshold && !triggeredThresholds.has(threshold)) {
          triggeredThresholds.add(threshold);
          this.track('Scroll Depth', {
            depth: threshold,
            maxDepth: maxScroll,
          });
        }
      });
    });
  }

  setupClickTracking() {
    // Track CTA clicks
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a, button');
      if (!target) return;

      // Track CTA button clicks
      if (target.dataset.track === 'cta-click') {
        this.track('CTA Click', {
          location: target.dataset.location || 'unknown',
          text: target.textContent.trim(),
          href: target.href || null,
        });
      }

      // Track navigation clicks
      if (target.tagName === 'A' && target.href) {
        const isInternal = target.href.startsWith(window.location.origin);
        const isOAuth = target.href.includes('/auth/');

        if (isOAuth) {
          this.track('OAuth Started', {
            provider: target.href.includes('github') ? 'github' : 'slack',
            location: target.dataset.location || 'unknown',
          });
        } else if (isInternal) {
          this.track('Internal Link Click', {
            href: target.href,
            text: target.textContent.trim(),
          });
        } else {
          this.track('External Link Click', {
            href: target.href,
            text: target.textContent.trim(),
          });
        }
      }
    });
  }

  setupFormTracking() {
    // Track form interactions
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
          data[key] = value;
        });

        this.track('Form Submit', {
          formId: form.id || 'unknown',
          fields: Object.keys(data),
          hasEmail: !!data.email,
        });
      });
    });

    // Track email input
    document.querySelectorAll('input[type="email"]').forEach((input) => {
      let emailEntered = false;

      input.addEventListener('input', () => {
        if (!emailEntered && input.value.includes('@')) {
          emailEntered = true;
          this.track('Email Entered', {
            formId: input.form?.id || 'unknown',
          });
        }
      });
    });
  }

  setupExitTracking() {
    // Track page exit
    window.addEventListener('beforeunload', () => {
      const timeOnPage = Math.round(performance.now() - this.pageLoadTime);

      this.track('Page Exit', {
        timeOnPage,
        maxScroll: this.maxScroll || 0,
      });
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.track('Page Hidden', {
          timeOnPage: Math.round(performance.now() - this.pageLoadTime),
        });
      } else {
        this.track('Page Visible', {
          timeOnPage: Math.round(performance.now() - this.pageLoadTime),
        });
      }
    });
  }

  // Track custom events
  trackEvent(eventName, properties = {}) {
    this.track(eventName, properties);
  }

  // Track conversion funnel
  trackConversionStep(step, properties = {}) {
    this.track('Conversion Step', {
      step,
      ...properties,
    });
  }

  // Track feature usage
  trackFeatureUsage(feature, action, properties = {}) {
    this.track('Feature Usage', {
      feature,
      action,
      ...properties,
    });
  }

  // Track errors
  trackError(error, context = {}) {
    this.track('Error', {
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  // Track performance metrics
  trackPerformance() {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const metrics = {
        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
        domContentLoadedTime: timing.domContentLoadedEventEnd - timing.navigationStart,
        firstPaintTime: timing.domLoading - timing.navigationStart,
        dnsTime: timing.domainLookupEnd - timing.domainLookupStart,
        connectTime: timing.connectEnd - timing.connectStart,
        responseTime: timing.responseEnd - timing.requestStart,
      };

      this.track('Performance Metrics', metrics);
    }
  }
}

// Initialize analytics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.pipeAnalytics = new PipeAnalytics();

  // Track performance metrics after page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.pipeAnalytics.trackPerformance();
    }, 1000);
  });
});

// Global error handling
window.addEventListener('error', (e) => {
  if (window.pipeAnalytics) {
    window.pipeAnalytics.trackError(e.error, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  if (window.pipeAnalytics) {
    window.pipeAnalytics.trackError(new Error(e.reason), {
      type: 'unhandledRejection',
    });
  }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PipeAnalytics;
}
