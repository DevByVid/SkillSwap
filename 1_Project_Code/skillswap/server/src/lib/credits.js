// Credit ledger + escrow (REQ-18, 19, 22). All functions take a transaction client.
const { HttpError } = require('./helpers');

async function account(db, userId) {
  const { rows } = await db.query('SELECT * FROM credit_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
  if (!rows[0]) throw new HttpError(400, 'Credit account missing.');
  return rows[0];
}

async function record(db, accountId, amount, type, note, swapId = null) {
  await db.query(
    'INSERT INTO credit_transactions (account_id, amount, type, note, swap_id) VALUES ($1,$2,$3,$4,$5)',
    [accountId, amount, type, note, swapId]
  );
}

async function grantStarter(db, userId, amount) {
  const { rows } = await db.query('INSERT INTO credit_accounts (user_id, balance) VALUES ($1,$2) RETURNING id', [userId, amount]);
  await record(db, rows[0].id, amount, 'STARTER', 'Welcome credits');
}

// Move credits from balance into escrow
async function hold(db, userId, amount, swapId) {
  if (amount <= 0) return;
  const acct = await account(db, userId);
  if (acct.balance < amount) throw new HttpError(400, `You only have ${acct.balance} credits available.`);
  await db.query('UPDATE credit_accounts SET balance=balance-$1, escrowed_balance=escrowed_balance+$1 WHERE id=$2', [amount, acct.id]);
  await record(db, acct.id, -amount, 'ESCROW_HOLD', `Held for swap #${swapId}`, swapId);
}

// Return escrowed credits to the payer (decline / cancel)
async function refund(db, userId, amount, swapId) {
  if (amount <= 0) return;
  const acct = await account(db, userId);
  await db.query('UPDATE credit_accounts SET balance=balance+$1, escrowed_balance=escrowed_balance-$1 WHERE id=$2', [amount, acct.id]);
  await record(db, acct.id, amount, 'ESCROW_REFUND', `Returned from swap #${swapId}`, swapId);
}

// Release escrow from payer to receiver (completion)
async function release(db, payerId, receiverId, amount, swapId) {
  if (amount <= 0) return;
  const payer = await account(db, payerId);
  const receiver = await account(db, receiverId);
  await db.query('UPDATE credit_accounts SET escrowed_balance=escrowed_balance-$1 WHERE id=$2', [amount, payer.id]);
  await db.query('UPDATE credit_accounts SET balance=balance+$1 WHERE id=$2', [amount, receiver.id]);
  await record(db, payer.id, 0, 'ESCROW_RELEASE', `Released ${amount} credits to your swap partner (swap #${swapId})`, swapId);
  await record(db, receiver.id, amount, 'ESCROW_RELEASE', `Received for swap #${swapId}`, swapId);
}

// Admin adjustment (dispute resolution); positive adds, negative removes
async function adjust(db, userId, amount, note, swapId = null) {
  const acct = await account(db, userId);
  if (acct.balance + amount < 0) throw new HttpError(400, 'Adjustment would make the balance negative.');
  await db.query('UPDATE credit_accounts SET balance=balance+$1 WHERE id=$2', [amount, acct.id]);
  await record(db, acct.id, amount, 'ADJUSTMENT', note, swapId);
}

module.exports = { grantStarter, hold, refund, release, adjust };
