// Animations for Pipe landing page
class PipeAnimations {
  constructor() {
    this.initializeAnimations();
    this.setupScrollAnimations();
    this.setupTerminalAnimation();
    this.setupInteractiveElements();
  }

  initializeAnimations() {
    // Add fade-in animation to elements as they come into view
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
        }
      });
    }, observerOptions);

    // Observe all elements with animation classes
    document.querySelectorAll('.animate-on-scroll').forEach((el) => {
      observer.observe(el);
    });
  }

  setupScrollAnimations() {
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      });
    });

    // Parallax effect for hero section
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const heroSection = document.querySelector('.hero-section');
      if (heroSection) {
        heroSection.style.transform = `translateY(${scrolled * 0.5}px)`;
      }
    });
  }

  setupTerminalAnimation() {
    const terminalCommand = document.getElementById('terminal-command');
    const terminalSolution = document.getElementById('terminal-solution');

    if (terminalCommand && terminalSolution) {
      this.typewriterEffect(terminalCommand, 'context-switch --time-lost', 100);

      // Start solution animation after a delay
      setTimeout(() => {
        this.typewriterEffect(terminalSolution, 'pipe --connect', 100);
      }, 3000);
    }
  }

  typewriterEffect(element, text, speed = 100) {
    let i = 0;
    element.textContent = '';

    const timer = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(timer);
        // Add blinking cursor
        const cursor = document.createElement('span');
        cursor.className = 'terminal-cursor';
        cursor.textContent = '|';
        element.appendChild(cursor);
      }
    }, speed);
  }

  setupInteractiveElements() {
    // Add hover effects to buttons
    document.querySelectorAll('button, .btn').forEach((button) => {
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-2px)';
      });

      button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0)';
      });
    });

    // Add click animation to CTA buttons
    document.querySelectorAll('[data-track="cta-click"]').forEach((cta) => {
      cta.addEventListener('click', (e) => {
        // Create ripple effect
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.left = e.offsetX + 'px';
        ripple.style.top = e.offsetY + 'px';
        cta.appendChild(ripple);

        setTimeout(() => {
          ripple.remove();
        }, 600);
      });
    });

    // Add loading state to form submissions
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', (e) => {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML = '<span class="spinner"></span> Connecting...';
        }
      });
    });
  }

  // Utility method to animate counters
  animateCounter(element, start, end, duration = 2000) {
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const current = Math.floor(start + (end - start) * progress);
      element.textContent = current.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  // Method to trigger confetti effect (for success states)
  triggerConfetti() {
    // Simple confetti effect
    const colors = ['#00D4AA', '#3B82F6', '#8B5CF6', '#F59E0B'];
    const confettiContainer = document.createElement('div');
    confettiContainer.style.position = 'fixed';
    confettiContainer.style.top = '0';
    confettiContainer.style.left = '0';
    confettiContainer.style.width = '100%';
    confettiContainer.style.height = '100%';
    confettiContainer.style.pointerEvents = 'none';
    confettiContainer.style.zIndex = '9999';

    document.body.appendChild(confettiContainer);

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.style.position = 'absolute';
      confetti.style.width = '8px';
      confetti.style.height = '8px';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * 100 + '%';
      confetti.style.animationDuration = Math.random() * 3 + 2 + 's';
      confetti.style.animationName = 'confetti-fall';
      confetti.style.animationTimingFunction = 'linear';
      confetti.style.animationIterationCount = '1';

      confettiContainer.appendChild(confetti);
    }

    // Remove confetti after animation
    setTimeout(() => {
      confettiContainer.remove();
    }, 5000);
  }
}

// CSS for confetti animation
const style = document.createElement('style');
style.textContent = `
    @keyframes confetti-fall {
        0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
        }
        100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
        }
    }
    
    @keyframes fade-in {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .animate-fade-in {
        animation: fade-in 0.6s ease-out forwards;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.6);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize animations when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PipeAnimations();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PipeAnimations;
}
