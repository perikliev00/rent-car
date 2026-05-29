// Car model – bulk update за премахване на изтеклали booked-date ranges.
const Car = require('../models/Car');

/**
 * Почиства Car.dates: нормализира date типове и премахва изминали ranges (Europe/Sofia).
 * Запазва само записи с endDate след now в Sofia timezone.
 */
async function cleanUpOutdatedDates() {
  try {
    const result = await Car.updateMany(
      {},
      [
        {
          $set: {
            dates: {
              $map: {
                input: { $ifNull: ["$dates", []] },
                as: "d",
                in: {
                  $mergeObjects: [
                    "$$d",
                    {
                      startDate: {
                        $convert: { input: "$$d.startDate", to: "date", onError: null, onNull: null }
                      },
                      endDate: {
                        $convert: { input: "$$d.endDate", to: "date", onError: null, onNull: null }
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        {
          $set: {
            dates: {
              $filter: {
                input: "$dates",
                as: "d",
                cond: {
                  $and: [
                    { $ne: ["$$d.endDate", null] },
                    {
                      $gt: [
                        {
                          $dateToString: {
                            date: "$$d.endDate",
                            format: "%Y-%m-%dT%H:%M:%S",
                            timezone: "Europe/Sofia"
                          }
                        },
                        {
                          $dateToString: {
                            date: "$$NOW",
                            format: "%Y-%m-%dT%H:%M:%S",
                            timezone: "Europe/Sofia"
                          }
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    );

    console.log(`🧹 Car.dates cleanup (Sofia): matched=${result.matchedCount ?? result.n}, modified=${result.modifiedCount ?? result.nModified}`);
  } catch (err) {
    console.error('Cleanup error (Car.dates Sofia):', err);
  }
}

module.exports = {
  cleanUpOutdatedDates,
};
