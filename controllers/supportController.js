// Support pages controller

// Get phone support page
exports.getPhoneSupport = async (req, res) => {
  try {
    res.render('phone-support', {
      title: 'Phone Support - Rent A Car'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading phone support page');
  }
};

// Get email support page
exports.getEmailSupport = async (req, res) => {
  try {
    res.render('email-support', {
      title: 'Email Support - Rent A Car'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading email support page');
  }
};

// Get visit location page
exports.getVisitLocation = async (req, res) => {
  try {
    res.render('visit-location', {
      title: 'Visit Our Location - Rent A Car'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading visit location page');
  }
};

// Get live chat page
exports.getLiveChat = async (req, res) => {
  try {
    res.render('live-chat', {
      title: 'Live Chat Support - Rent A Car'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading live chat page');
  }
};

// Handle email support form submission
exports.postEmailSupport = async (req, res) => {
  try {
    const { name, email, subject, priority, message } = req.body;
    
    // Here you would typically save to database or send email
    console.log('Email support submission:', {
      name,
      email,
      subject,
      priority,
      message,
      timestamp: new Date()
    });
    
    res.render('email-support', {
      title: 'Email Support - Rent A Car',
      successMessage: 'Thank you for contacting us! We will respond within our stated timeframes based on your priority level.'
    });
    
  } catch (err) {
    console.error(err);
    res.render('email-support', {
      title: 'Email Support - Rent A Car',
      errorMessage: 'There was an error sending your message. Please try again.'
    });
  }
};