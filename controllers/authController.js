const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

exports.getLogin = (req, res) => {
	res.render('login', { title: 'Login' });
};
exports.postLogin = (req, res) => {
	const errors = validationResult(req);
	const { email, password } = req.body;
	if (!errors.isEmpty()) {
		return res.status(422).render('login', {
			title: 'Login',
			email,
			errors: errors.array()
		});
	}
	User.findOne({email:email}).then(user => {
		if (!user) {
			return res.status(401).render('login', {
				title: 'Login',
				email,
				errors: [{ msg: 'Invalid email or password' }]
			});
		}
		bcrypt.compare(password, user.password)
		.then(result => {
			if (result) {
				req.session.isLoggedIn = true;
				req.session.user = user;
				console.log(req.session.user);
				return res.redirect('/');
			} else {
				return res.status(401).render('login', {
					title: 'Login',
					email,
					errors: [{ msg: 'Invalid email or password' }]
				});
			}
		})

	});
};

exports.getSignup = (req, res) => {
	res.render('signup', { title: 'Sign up' });
};

exports.postSignup = async (req, res) => {
	try {
		const errors = validationResult(req);
		const { email, password } = req.body;
		if (!errors.isEmpty()) {
			return res.status(422).render('signup', {
				title: 'Sign up',
				email,
				errors: errors.array()
			});
		}

		if (!email || !password) {
			return res.status(400).render('signup', {
				title: 'Sign up',
				errors: [{ msg: 'Email and password are required' }],
				email
			});
		}

		const existingUser = await User.findOne({ email });
		if (existingUser) {
			return res.status(400).render('signup', {
				title: 'Sign up',
				errors: [{ msg: 'Email is already in use' }],
				email
			});
		}

		const hashedPassword = await bcrypt.hash(password, 10);
		const user = new User({ email, password: hashedPassword });
		await user.save();

		req.session.isLoggedIn = true;
		req.session.user = user;
		return res.redirect('/');
	} catch (err) {
		console.error('Signup error:', err);
		return res.status(500).render('signup', {
			title: 'Sign up',
			errors: [{ msg: 'Something went wrong. Please try again.' }]
		});
	}
};

exports.getLogout = (req, res) => {
	try {
		req.session.isLoggedIn = false;
		req.session.user = null;
		req.session.destroy(err => {
			if (err) {
				console.error('Session destroy error:', err);
			}
			return res.redirect('/');
		});
	} catch (err) {
		console.error('Logout error:', err);
		return res.redirect('/');
	}
};