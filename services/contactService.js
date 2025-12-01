function trimContactDetails(payload = {}) {
  return {
    fullName: (payload.fullName || '').trim(),
    phoneNumber: (payload.phoneNumber || '').trim(),
    email: (payload.email || '').trim(),
    address: (payload.address || '').trim(),
    hotelName: (payload.hotelName || '').trim(),
  };
}

/**
 * Determine if required contact fields are incomplete.
 * Mirrors the existing admin behavior: fullName, phoneNumber, email, and address are required.
 */
function contactFieldsIncomplete(contact) {
  // In admin logic, hotelName was not required; keep that behavior.
  const { fullName, phoneNumber, email, address } = contact || {};
  return [fullName, phoneNumber, email, address].some((value) => !value);
}

module.exports = {
  trimContactDetails,
  contactFieldsIncomplete,
};


