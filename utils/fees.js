const FEES = {
  office: 0,
  'sunny-beach': 25,
  'sveti-vlas': 30,
  nesebar: 30,
  burgas: 40,
  'burgas-airport': 50,
  sofia: 100,
  'sofia-airport': 120,
  varna: 80,
  'varna-airport': 90,
  plovdiv: 70,
  eleni: 35,
  ravda: 20,
};

const feeFor = (loc) => FEES[loc] ?? 0;

module.exports = { FEES, feeFor };


