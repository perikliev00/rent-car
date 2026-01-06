(function initDatePickers() {
  function init() {
    const pickupDateEl = document.getElementById('pickup-date');
    const returnDateEl = document.getElementById('return-date');
    
    if (!pickupDateEl || !returnDateEl) return;
    
    // Get today's date for validation (but allow navigation to past months)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Initialize pickup date picker - allow navigation to past months
    const pickupPicker = flatpickr(pickupDateEl, {
      dateFormat: 'Y-m-d',
      minDate: today, // Prevent selecting past dates, but allow navigation
      allowInput: true,
      clickOpens: true,
      // Fancy styling options
      theme: 'dark', // Use dark theme
      animate: true,
      monthSelectorType: 'static', // Always show month/year selector
      enableTime: false,
      // Custom styling classes
      className: 'luxride-datepicker',
    });
    
    // Initialize return date picker
    const returnPicker = flatpickr(returnDateEl, {
      dateFormat: 'Y-m-d',
      minDate: today,
      allowInput: true,
      clickOpens: true,
      theme: 'dark',
      animate: true,
      monthSelectorType: 'static',
      enableTime: false,
      className: 'luxride-datepicker',
    });
    
    // Update return date minDate when pickup date changes
    pickupPicker.config.onChange.push(function(selectedDates) {
      if (selectedDates.length > 0) {
        const selectedDate = new Date(selectedDates[0]);
        selectedDate.setDate(selectedDate.getDate() + 1); // Return must be at least 1 day after pickup
        returnPicker.set('minDate', selectedDate);
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

