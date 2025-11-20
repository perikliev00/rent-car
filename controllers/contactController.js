// Get contacts page
exports.getContacts = async (req, res, next) => {
  try {
    res.render('contacts', {
      title: 'Contact Us - Rent A Car'
    });
  } catch (err) {
    console.error('getContacts error:', err);
    err.publicMessage = 'Error loading contacts page.';
    return next(err);
  }
};

// Handle contact form submission
exports.postContact = async (req, res, next) => {
  try {
    const Contact = require('../models/Contact');
    const { name, email, phone, subject, message } = req.body;
    await Contact.create({ name, email, phone, subject, message, status: 'new' });
    res.render('contacts', {
      title: 'Contact Us - Rent A Car',
      successMessage: 'Thank you for your message! We will get back to you soon.'
    });
  } catch (err) {
    console.error('postContact error:', err);
    err.publicMessage = 'There was an error sending your message. Please try again later.';
    return next(err);
  }
};

// Admin: list contacts
exports.getAdminContacts = async (req, res, next) => {
  try {
    const Contact = require('../models/Contact');
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.render('admin/contacts', { title: 'Contact Messages', contacts });
  } catch (err) {
    console.error('Get admin contacts error:', err);
    err.publicMessage = 'Error loading contacts.';
    return next(err);
  }
};

// Admin: update status
exports.postUpdateContactStatus = async (req, res, next) => {
  try {
    const Contact = require('../models/Contact');
    const { status } = req.body; // expected: 'new' | 'ready' | 'done'
    await Contact.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/contacts');
  } catch (err) {
    console.error('Update contact status error:', err);
    err.publicMessage = 'Error updating status.';
    return next(err);
  }
};

// Admin: delete contact
exports.postDeleteContact = async (req, res, next) => {
  try {
    const Contact = require('../models/Contact');
    await Contact.findByIdAndDelete(req.params.id);
    res.redirect('/admin/contacts');
  } catch (err) {
    console.error('Delete contact error:', err);
    err.publicMessage = 'Error deleting contact.';
    return next(err);
  }
};