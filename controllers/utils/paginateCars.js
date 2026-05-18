const Car = require('../models/Car');

const DEFAULT_PER_PAGE = 3;
const DEFAULT_SORT = { name: 1 };

function parsePage(raw, { min = 1, max = 999999 } = {}) {
  const n = parseInt(String(raw ?? ''), 10);
  const page = Number.isFinite(n) ? n : 1;
  return Math.min(max, Math.max(min, page));
}

/**
 * Server-side pagination за коли.
 * @param {object} filter - MongoDB match ({} = всички, match = налични и т.н.)
 * @param {object} [options]
 * @param {number|string} [options.page=1]
 * @param {number} [options.perPage=3]
 * @param {object|null} [options.sort={ name: 1 }] - null пропуска sort
 * @param {boolean} [options.lean=false]
 */
async function paginateCars(filter = {}, options = {}) {
  const {
    page: requestedPage = 1,
    perPage = DEFAULT_PER_PAGE,
    sort = DEFAULT_SORT,
    lean = false,
  } = options;

  const currentPage = parsePage(requestedPage);
  const skip = (currentPage - 1) * perPage;

  let query = Car.find(filter).skip(skip).limit(perPage);
  if (sort) query = query.sort(sort);
  if (lean) query = query.lean();

  const [cars, totalCount] = await Promise.all([
    query,
    Car.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  return { cars, currentPage, totalPages, totalCount, perPage, skip };
}

module.exports = { paginateCars, parsePage, DEFAULT_PER_PAGE };
