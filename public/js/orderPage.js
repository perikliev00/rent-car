// Order Page JavaScript functionality

document.addEventListener('DOMContentLoaded', function() {

    // Add loading animations to elements
    const orderContainer = document.querySelector('.order-details-container');
    const infoCards = document.querySelectorAll('.info-card');
    const actionButtons = document.querySelectorAll('.action-btn');
    
    // Animate order container on load
    if (orderContainer) {
        orderContainer.style.opacity = '0';
        orderContainer.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            orderContainer.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            orderContainer.style.opacity = '1';
            orderContainer.style.transform = 'translateY(0)';
        }, 100);
    }
    
    // Animate info cards with stagger effect
    infoCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 300 + (index * 100));
    });
    
    // Add hover effects to action buttons
    actionButtons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px) scale(1.02)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });
    
    // Add click animations
    actionButtons.forEach(button => {
        button.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
});

// Global functions for order actions
function goBack() {
    // Add loading state
    const button = event.target.closest('.action-btn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    button.disabled = true;
    
    // Simulate loading and redirect
    setTimeout(() => {
        window.history.back();
    }, 800);
}

function printOrder() {
    // Add loading state
    const button = event.target.closest('.action-btn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing...';
    button.disabled = true;
    
    // Prepare print styles
    const printStyles = `
        <style>
            @media print {
                body * { visibility: hidden; }
                .order-details-container, .order-details-container * { visibility: visible; }
                .order-details-container { position: absolute; left: 0; top: 0; width: 100%; }
                .order-actions { display: none; }
                .car-overlay { display: none; }
            }
        </style>
    `;
    
    // Add print styles to head
    const styleSheet = document.createElement('style');
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);
    
    setTimeout(() => {
        window.print();
        
        // Remove print styles and reset button
        document.head.removeChild(styleSheet);
        button.innerHTML = originalText;
        button.disabled = false;
    }, 500);
}

function proceedToPayment() {
    // Add loading state
    const button = event.target.closest('.action-btn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    button.disabled = true;
    
    // Simulate processing and redirect to payment
    setTimeout(() => {
        // This would typically redirect to payment page
        // For now, we'll show a success message
        showNotification('Redirecting to payment...', 'success');
        
        // Reset button after delay
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 2000);
    }, 1000);
}

function viewCarDetails() {
    // Add loading state
    const button = event.target.closest('.view-details-btn');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    button.disabled = true;
    
    // Simulate loading car details
    setTimeout(() => {
        showNotification('Car details would open in a modal or new page', 'info');
        
        // Reset button
        button.innerHTML = originalText;
        button.disabled = false;
    }, 1000);
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add notification styles
    const notificationStyles = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1a1a1a;
            border: 2px solid #ffd23f;
            border-radius: 10px;
            padding: 1rem 1.5rem;
            color: #ffffff;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 1rem;
            min-width: 300px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
            animation: slideInRight 0.3s ease;
        }
        
        .notification-success {
            border-color: #4CAF50;
        }
        
        .notification-error {
            border-color: #f44336;
        }
        
        .notification-info {
            border-color: #2196F3;
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex: 1;
        }
        
        .notification-close {
            background: none;
            border: none;
            color: #b8b8d1;
            cursor: pointer;
            padding: 0.25rem;
            border-radius: 4px;
            transition: color 0.3s ease;
        }
        
        .notification-close:hover {
            color: #ffffff;
        }
        
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    
    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'notification-styles';
        styleSheet.textContent = notificationStyles;
        document.head.appendChild(styleSheet);
    }
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'info': return 'info-circle';
        default: return 'info-circle';
    }
}

// Function to disable order form when order already exists
function disableOrderForm(message) {
    const form = document.querySelector('.user-details-form');
    const submitButton = document.querySelector('button[type="submit"]');
    const inputs = form.querySelectorAll('input, textarea');
    
    // Disable all form inputs
    inputs.forEach(input => {
        input.disabled = true;
        input.style.opacity = '0.5';
        input.style.cursor = 'not-allowed';
    });
    
    // Disable submit button
    submitButton.disabled = true;
    submitButton.style.opacity = '0.5';
    submitButton.style.cursor = 'not-allowed';
    submitButton.innerHTML = '<i class="fas fa-lock"></i> Order Already Completed';
    
    // Add warning message
    const warningDiv = document.createElement('div');
    warningDiv.className = 'order-warning';
    warningDiv.innerHTML = `
        <div class="warning-content">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add warning styles
    const warningStyles = `
        .order-warning {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
            border: 2px solid #ff4757;
            border-radius: 10px;
            padding: 1rem;
            margin: 1rem 0;
            color: #ffffff;
            text-align: center;
            box-shadow: 0 4px 15px rgba(255, 71, 87, 0.3);
        }
        
        .warning-content {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            font-weight: 600;
        }
        
        .warning-content i {
            font-size: 1.2rem;
        }
    `;
    
    // Add styles if not already added
    if (!document.querySelector('#warning-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'warning-styles';
        styleSheet.textContent = warningStyles;
        document.head.appendChild(styleSheet);
    }
    
    // Insert warning before form
    form.parentNode.insertBefore(warningDiv, form);
    
    // Show notification
    showNotification(message, 'error');
}

// Add smooth scrolling for any anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    // Escape key to close any modals or go back
    if (e.key === 'Escape') {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(notification => notification.remove());
    }
    
    // Enter key on action buttons
    if (e.key === 'Enter' && e.target.classList.contains('action-btn')) {
        e.target.click();
    }
});
