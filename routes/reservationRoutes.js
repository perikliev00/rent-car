const express = require('express');
const mongoose = require('mongoose');

const Reservation = require('../models/Reservation');
const { ACTIVE_RESERVATION_STATUSES } = require('../utils/reservationHelpers');

const router = express.Router();

router.post('/reservations/release', async (req, res, next) => {
  try {
    const sessionId = req.sessionID;
    if (!sessionId) {
      const back = req.body.redirect || req.get('referer') || '/';
      return res.redirect(303, back);
    }

    const q = { sessionId, status: { $in: ACTIVE_RESERVATION_STATUSES } };
    if (req.body && req.body.reservationId && mongoose.isValidObjectId(String(req.body.reservationId))) {
      q._id = String(req.body.reservationId);
    }

    const now = new Date();
    await Reservation.findOneAndUpdate(
      q,
      { $set: { status: 'expired', holdExpiresAt: now } },
      { new: true }
    );

    try { req.session.releasedAt = Date.now(); } catch (e) {}

    const back = req.body.redirect || req.get('referer') || '/';
    return res.redirect(303, back);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

