// Footer pages controller

// Careers page
exports.getCareers = (req, res) => {
    res.render('careers', {
        title: 'Careers - Join Our Team'
    });
};

// Blog page
exports.getBlog = (req, res) => {
    res.render('blog', {
        title: 'Blog - Latest News & Updates'
    });
};

// FAQ page
exports.getFAQ = (req, res) => {
    res.render('faq', {
        title: 'Frequently Asked Questions'
    });
};

// Roadside Assistance page
exports.getRoadside = (req, res) => {
    res.render('roadside', {
        title: 'Roadside Assistance'
    });
};

// Terms of Service page
exports.getTerms = (req, res) => {
    res.render('terms', {
        title: 'Terms of Service'
    });
};

// Privacy Policy page
exports.getPrivacy = (req, res) => {
    res.render('privacy', {
        title: 'Privacy Policy'
    });
};

// Cookie Policy page
exports.getCookies = (req, res) => {
    res.render('cookies', {
        title: 'Cookie Policy'
    });
};

// Accessibility page
exports.getAccessibility = (req, res) => {
    res.render('accessibility', {
        title: 'Accessibility'
    });
};

// Code of Conduct page
exports.getCodeOfConduct = (req, res) => {
    res.render('code-of-conduct', {
        title: 'Code of Conduct'
    });
};

// Responsible Disclosure page
exports.getResponsibleDisclosure = (req, res) => {
    res.render('responsible-disclosure', {
        title: 'Responsible Disclosure'
    });
};

// Booking/info group
exports.getHowToBook = (req, res) => {
    res.render('how-to-book', {
        title: 'How to Book'
    });
};

exports.getPaymentMethods = (req, res) => {
    res.render('payment-methods', {
        title: 'Payment Methods'
    });
};

exports.getDeliveryReturns = (req, res) => {
    res.render('delivery-returns', {
        title: 'Delivery & Returns'
    });
};

// Roadside subsections
exports.getRoadsideCoverage = (req, res) => {
    res.render('roadside-coverage', {
        title: 'Roadside Coverage'
    });
};

exports.getRoadsideWhatToDo = (req, res) => {
    res.render('roadside-what-to-do', {
        title: 'Roadside: What to Do'
    });
};

exports.getRoadsideInsurance = (req, res) => {
    res.render('roadside-insurance', {
        title: 'Roadside Insurance'
    });
};