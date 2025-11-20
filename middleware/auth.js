function requireAuth(req, res, next) {
	if (req.session && req.session.isLoggedIn) {
		return next();
	}
	return res.redirect('/login');
}

function requireGuest(req, res, next) {
	if (req.session && req.session.isLoggedIn) {
		return res.redirect('/');
	}
	return next();
}

function requireAdmin(req, res, next) {
	if (!req.session || !req.session.isLoggedIn || !req.session.user) {
		return res.redirect('/login');
	}

	if (req.session.user.role !== 'admin') {
		return res.redirect('/');
	}

	return next();
}

module.exports = { requireAuth, requireGuest, requireAdmin };


