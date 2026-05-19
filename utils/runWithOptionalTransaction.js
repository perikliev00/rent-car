// Mongoose – за стартиране на сесии и транзакции.
const mongoose = require('mongoose');

// Опции за MongoDB транзакция – чете от primary, write concern majority за консистентност.
const TXN_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'local' },
  writeConcern: { w: 'majority' },
};

// Проверява дали грешката е от неподдържани транзакции (напр. standalone Mongo без replica set).
function isTransactionUnsupportedError(err) {
  if (!err || !err.message) return false;

  const msg = err.message.toLowerCase();
  return (
    msg.includes('transaction numbers are only allowed on a replica set') ||
    msg.includes('transactions are not supported') ||
    msg.includes('replica set')
  );
}

// Изпълнява work функцията в транзакция; при неподдържана среда – fallback без транзакция.
async function runWithOptionalTransaction(work) {
  let session = null;

  try {
    // Създаваме нова MongoDB сесия.
    session = await mongoose.startSession();
    // Изпълняваме work(session) в транзакция – при грешка транзакцията се отменя.
    await session.withTransaction(async () => {
      await work(session);
    }, TXN_OPTIONS);
  } catch (err) {
    if (session) {
      try {
        // Опит да отменим транзакцията явно при грешка.
        await session.abortTransaction();
      } catch (_) {
        // Игнорираме грешки от abort – запазваме първоначалната грешка.
      }
    }

    // Локални/dev среди често нямат replica set – вместо да падаме, пробваме без транзакция.
    if (isTransactionUnsupportedError(err)) {
      await work(null);
      return;
    }

    throw err;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

// Експорт на опциите, проверката и основната функция.
module.exports = {
  TXN_OPTIONS,
  isTransactionUnsupportedError,
  runWithOptionalTransaction,
};
