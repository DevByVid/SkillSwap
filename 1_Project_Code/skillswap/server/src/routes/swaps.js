// Swap proposal, negotiation & scheduling (SRS 4.3, Experiments 6–8).
// Status transitions follow the state chart:
//   DRAFT → PROPOSED → (DECLINED | NEGOTIATING ⟲ | ACCEPTED) → SCHEDULED ⟲ → (CANCELLED | COMPLETED) → CLOSED
const router = require('express').Router();
const { query, tx } = require('../db');
const { ah, HttpError, notify, logSwapEvent, filterMessage } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');
const credits = require('../lib/credits');
const calendar = require('../lib/calendar');

router.use(requireAuth);

const firstName = (n) => (n || '').split(' ')[0];

async function loadSwap(db, id, userId, lock = false) {
  const { rows } = await db.query(`SELECT * FROM swaps WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
  const s = rows[0];
  if (!s) throw new HttpError(404, 'Swap not found.');
  if (userId && s.proposer_id !== userId && s.recipient_id !== userId) throw new HttpError(403, 'This swap isn’t yours.');
  return s;
}
const otherParty = (s, me) => (s.proposer_id === me ? s.recipient_id : s.proposer_id);
const requireStatus = (s, ...allowed) => {
  if (!allowed.includes(s.status)) throw new HttpError(409, `This swap is ${s.status.toLowerCase()}, so that action isn’t available.`);
};

async function swapDetail(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT sw.*,
       json_build_object('id',p.id,'name',p.name,'avatar_color',p.avatar_color,'trust_badge',p.trust_badge,'location',p.location) AS proposer,
       json_build_object('id',r.id,'name',r.name,'avatar_color',r.avatar_color,'trust_badge',r.trust_badge,'location',r.location) AS recipient,
       json_build_object('id',ol.id,'skill',os.name,'level',ol.level,'category',os.category) AS offered,
       json_build_object('id',rl.id,'skill',rs.name,'level',rl.level,'category',rs.category) AS requested
     FROM swaps sw
     JOIN users p ON p.id=sw.proposer_id JOIN users r ON r.id=sw.recipient_id
     LEFT JOIN listings ol ON ol.id=sw.offered_listing_id LEFT JOIN skills os ON os.id=ol.skill_id
     LEFT JOIN listings rl ON rl.id=sw.requested_listing_id LEFT JOIN skills rs ON rs.id=rl.skill_id
     WHERE sw.id=$1`, [id]);
  return rows[0];
}

// List my swaps
router.get('/', ah(async (req, res) => {
  const ids = await query(
    'SELECT id FROM swaps WHERE (proposer_id=$1 OR recipient_id=$1) AND NOT (status=$2 AND proposer_id<>$1) ORDER BY updated_at DESC',
    [req.user.id, 'DRAFT']);
  const swaps = await Promise.all(ids.rows.map((r) => swapDetail(r.id)));
  const sessions = await query(
    `SELECT DISTINCT ON (swap_id) * FROM sessions WHERE swap_id = ANY($1) ORDER BY swap_id, created_at DESC`,
    [ids.rows.map((r) => r.id)]);
  const unread = await query(
    `SELECT swap_id, COUNT(*)::int AS n FROM messages WHERE swap_id = ANY($1) AND sender_id<>$2
       AND sent_at > NOW() - INTERVAL '2 days' GROUP BY swap_id`, [ids.rows.map((r) => r.id), req.user.id]);
  const reviewed = await query('SELECT swap_id FROM reviews WHERE swap_id = ANY($1) AND reviewer_id=$2', [ids.rows.map((r) => r.id), req.user.id]);
  const rSet = new Set(reviewed.rows.map((r) => r.swap_id));
  const sMap = Object.fromEntries(sessions.rows.map((s) => [s.swap_id, s]));
  const uMap = Object.fromEntries(unread.rows.map((u) => [u.swap_id, u.n]));
  res.json({ swaps: swaps.map((s) => ({ ...s, session: sMap[s.id] || null, recentMessages: uMap[s.id] || 0, i_reviewed: rSet.has(s.id) })) });
}));

router.get('/:id', ah(async (req, res) => {
  await loadSwap({ query }, req.params.id, req.user.id);
  const swap = await swapDetail(req.params.id);
  const [session, events, reviews, dispute] = await Promise.all([
    query('SELECT * FROM sessions WHERE swap_id=$1 ORDER BY created_at DESC LIMIT 1', [swap.id]),
    query(`SELECT e.*, u.name AS actor FROM swap_events e LEFT JOIN users u ON u.id=e.actor_id
           WHERE swap_id=$1 ORDER BY e.created_at`, [swap.id]),
    query('SELECT * FROM reviews WHERE swap_id=$1', [swap.id]),
    query(`SELECT * FROM disputes WHERE swap_id=$1 ORDER BY created_at DESC LIMIT 1`, [swap.id]),
  ]);
  res.json({ swap, session: session.rows[0] || null, events: events.rows, reviews: reviews.rows, dispute: dispute.rows[0] || null });
}));

// 1. Send swap proposal (REQ-9, REQ-11, REQ-22). Credits are held in escrow on send.
router.post('/', ah(async (req, res) => {
  const { requestedListingId, offeredListingId, credits: creditsOffered = 0, message = '', draft = false } = req.body;
  const amount = Math.max(0, parseInt(creditsOffered, 10) || 0);
  const id = await tx(async (db) => {
    const reqL = (await db.query(`SELECT l.*, s.name AS skill FROM listings l JOIN skills s ON s.id=l.skill_id
      WHERE l.id=$1 AND l.is_active`, [requestedListingId])).rows[0];
    if (!reqL) throw new HttpError(400, 'That listing is no longer available.');
    if (reqL.user_id === req.user.id) throw new HttpError(400, 'You can’t send a proposal to yourself.');
    let offL = null;
    if (offeredListingId) {
      offL = (await db.query(`SELECT l.*, s.name AS skill FROM listings l JOIN skills s ON s.id=l.skill_id
        WHERE l.id=$1 AND l.user_id=$2 AND l.is_active AND l.type='OFFER'`, [offeredListingId, req.user.id])).rows[0];
      if (!offL) throw new HttpError(400, 'Choose one of the skills you offer.');
    }
    if (!offL && amount === 0) throw new HttpError(400, 'Offer a skill in return, or some credits.');

    const open = await db.query(
      `SELECT 1 FROM swaps WHERE proposer_id=$1 AND requested_listing_id=$2 AND status IN ('PROPOSED','NEGOTIATING')`,
      [req.user.id, reqL.id]);
    if (open.rowCount) throw new HttpError(409, 'You already have an open proposal for this listing.');

    const status = draft ? 'DRAFT' : 'PROPOSED';
    const { rows } = await db.query(
      `INSERT INTO swaps (proposer_id, recipient_id, offered_listing_id, requested_listing_id, credits_offered, message, status, awaiting_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.user.id, reqL.user_id, offL?.id || null, reqL.id, amount, message, status, draft ? req.user.id : reqL.user_id]);
    const swapId = rows[0].id;
    await logSwapEvent(db, swapId, req.user.id, 'CREATED', draft ? 'Saved as draft' : '');
    if (!draft) await sendProposal(db, swapId, req.user, reqL.skill, offL?.skill, amount);
    return swapId;
  });
  res.status(201).json({ swap: await swapDetail(id) });
}));

async function sendProposal(db, swapId, user, wantedSkill, offeredSkill, amount) {
  const s = await loadSwap(db, swapId, null, true);
  await credits.hold(db, user.id, amount, swapId);
  await logSwapEvent(db, swapId, user.id, 'PROPOSED',
    [offeredSkill && `Offers ${offeredSkill}`, amount && `${amount} credits`].filter(Boolean).join(' + '));
  // 2. Forward proposal to the recipient
  await notify(db, s.recipient_id, 'PROPOSAL',
    `${firstName(user.name)} would like to learn ${wantedSkill} from you${offeredSkill ? ` in exchange for ${offeredSkill}` : ''}${amount ? ` (+${amount} credits)` : ''}.`,
    `/swaps/${swapId}`);
}

// DRAFT → PROPOSED
router.post('/:id/send', ah(async (req, res) => {
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    if (s.proposer_id !== req.user.id) throw new HttpError(403, 'Only the sender can send a draft.');
    requireStatus(s, 'DRAFT');
    await db.query(`UPDATE swaps SET status='PROPOSED', awaiting_user_id=recipient_id, updated_at=NOW() WHERE id=$1`, [s.id]);
    const names = (await db.query(
      `SELECT (SELECT s2.name FROM listings l JOIN skills s2 ON s2.id=l.skill_id WHERE l.id=$1) AS wanted,
              (SELECT s2.name FROM listings l JOIN skills s2 ON s2.id=l.skill_id WHERE l.id=$2) AS offered`,
      [s.requested_listing_id, s.offered_listing_id])).rows[0];
    await sendProposal(db, s.id, req.user, names.wanted, names.offered, s.credits_offered);
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

router.delete('/:id', ah(async (req, res) => {
  const s = await loadSwap({ query }, req.params.id, req.user.id);
  if (s.status !== 'DRAFT' || s.proposer_id !== req.user.id) throw new HttpError(409, 'Only drafts can be deleted.');
  await query('DELETE FROM swaps WHERE id=$1', [s.id]);
  res.json({ ok: true });
}));

// 3. Respond to proposal: accept / decline / counter (REQ-10)
router.post('/:id/respond', ah(async (req, res) => {
  const { action, credits: newCredits, offeredListingId, message = '' } = req.body;
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'PROPOSED', 'NEGOTIATING');
    if (s.awaiting_user_id !== req.user.id) throw new HttpError(409, 'It’s the other person’s turn to respond.');
    const other = otherParty(s, req.user.id);
    const me = firstName(req.user.name);

    if (action === 'decline') {
      await credits.refund(db, s.proposer_id, s.credits_offered, s.id);
      await db.query(`UPDATE swaps SET status='DECLINED', awaiting_user_id=NULL, updated_at=NOW() WHERE id=$1`, [s.id]);
      await logSwapEvent(db, s.id, req.user.id, 'DECLINED', message);
      await notify(db, other, 'PROPOSAL', `${me} declined the swap. Any credits you offered are back in your balance.`, `/swaps/${s.id}`);
    } else if (action === 'accept') {
      await db.query(`UPDATE swaps SET status='ACCEPTED', awaiting_user_id=NULL, agreed_at=NOW(), updated_at=NOW() WHERE id=$1`, [s.id]);
      await logSwapEvent(db, s.id, req.user.id, 'ACCEPTED', message);
      await notify(db, other, 'PROPOSAL', `${me} accepted your swap. Next, agree on a time.`, `/swaps/${s.id}`);
    } else if (action === 'counter') {
      // Counter can change the credit amount (always paid by the proposer) and the proposer's offered skill.
      const amount = newCredits === undefined ? s.credits_offered : Math.max(0, parseInt(newCredits, 10) || 0);
      let offered = s.offered_listing_id;
      if (offeredListingId !== undefined && offeredListingId !== s.offered_listing_id) {
        if (offeredListingId) {
          const ok = await db.query(`SELECT 1 FROM listings WHERE id=$1 AND user_id=$2 AND type='OFFER' AND is_active`, [offeredListingId, s.proposer_id]);
          if (!ok.rowCount) throw new HttpError(400, 'That skill isn’t one the proposer offers.');
        }
        offered = offeredListingId || null;
      }
      if (!offered && amount === 0) throw new HttpError(400, 'A swap needs a skill or some credits in return.');
      const diff = amount - s.credits_offered;
      if (diff > 0) {
        try { await credits.hold(db, s.proposer_id, diff, s.id); }
        catch (e) {
          if (s.proposer_id === req.user.id) throw e;
          throw new HttpError(400, 'The proposer doesn’t have enough credits for that amount. Try a smaller number.');
        }
      }
      if (diff < 0) await credits.refund(db, s.proposer_id, -diff, s.id);
      await db.query(
        `UPDATE swaps SET status='NEGOTIATING', credits_offered=$1, offered_listing_id=$2, awaiting_user_id=$3, updated_at=NOW() WHERE id=$4`,
        [amount, offered, other, s.id]);
      await logSwapEvent(db, s.id, req.user.id, 'COUNTERED', [`${amount} credits`, message].filter(Boolean).join(' · '));
      await notify(db, other, 'PROPOSAL', `${me} sent a counter-offer. Take a look and reply.`, `/swaps/${s.id}`);
    } else {
      throw new HttpError(400, 'Choose accept, decline or counter.');
    }
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

function validateSession(body) {
  const { scheduledAt, durationHours = 1, mode = 'VIRTUAL', place = '', meetingLink = '' } = body;
  const when = new Date(scheduledAt);
  if (!scheduledAt || isNaN(when)) throw new HttpError(400, 'Pick a date and time.');
  if (when < new Date()) throw new HttpError(400, 'Pick a time in the future.');
  const dur = Number(durationHours);
  if (!(dur >= 0.5 && dur <= 8)) throw new HttpError(400, 'Sessions can run from 30 minutes to 8 hours.');
  if (!['VIRTUAL', 'IN_PERSON'].includes(mode)) throw new HttpError(400, 'Choose online or in person.');
  if (mode === 'IN_PERSON' && !place.trim()) throw new HttpError(400, 'Add a public meeting place.');
  return { when, dur, mode, place: place.trim(), meetingLink: meetingLink.trim() };
}

// Propose a date/time (Accepted state). The other user then confirms (REQ-12).
router.post('/:id/session', ah(async (req, res) => {
  const v = validateSession(req.body);
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'ACCEPTED');
    await db.query(`UPDATE sessions SET status='CANCELLED' WHERE swap_id=$1 AND status='PROPOSED'`, [s.id]);
    await db.query(
      `INSERT INTO sessions (swap_id, scheduled_at, duration_hours, mode, place, meeting_link) VALUES ($1,$2,$3,$4,$5,$6)`,
      [s.id, v.when, v.dur, v.mode, v.place, v.meetingLink]);
    const isProposer = s.proposer_id === req.user.id;
    await db.query(
      `UPDATE swaps SET proposer_confirmed=$1, recipient_confirmed=$2, awaiting_user_id=$3, updated_at=NOW() WHERE id=$4`,
      [isProposer, !isProposer, otherParty(s, req.user.id), s.id]);
    await logSwapEvent(db, s.id, req.user.id, 'TIME_PROPOSED', v.when.toISOString());
    await notify(db, otherParty(s, req.user.id), 'SCHEDULE', `${firstName(req.user.name)} suggested a time for your session. Confirm it or suggest another.`, `/swaps/${s.id}`);
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// 4/5. Confirm swap. When both confirm → 6/7 create calendar event → SCHEDULED → 8/9 notify both
router.post('/:id/confirm', ah(async (req, res) => {
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'ACCEPTED');
    const sess = (await db.query(`SELECT * FROM sessions WHERE swap_id=$1 AND status='PROPOSED' ORDER BY created_at DESC LIMIT 1`, [s.id])).rows[0];
    if (!sess) throw new HttpError(409, 'Suggest a time first.');
    const isProposer = s.proposer_id === req.user.id;
    const pc = isProposer ? true : s.proposer_confirmed;
    const rc = isProposer ? s.recipient_confirmed : true;
    await logSwapEvent(db, s.id, req.user.id, 'CONFIRMED');
    if (pc && rc) {
      const d = await swapDetail(s.id, db);
      const ev = calendar.createEvent({
        title: `SkillSwap: ${d.requested.skill}${d.offered?.skill ? ' ⇄ ' + d.offered.skill : ''}`,
        details: `Skill swap between ${d.proposer.name} and ${d.recipient.name}.${sess.meeting_link ? ' Join: ' + sess.meeting_link : ''}`,
        start: sess.scheduled_at, durationHours: sess.duration_hours,
        location: sess.mode === 'IN_PERSON' ? sess.place : 'Online',
      });
      await db.query(`UPDATE sessions SET status='SCHEDULED', calendar_event_id=$1, calendar_url=$2 WHERE id=$3`, [ev.eventId, ev.url, sess.id]);
      await db.query(`UPDATE swaps SET status='SCHEDULED', proposer_confirmed=TRUE, recipient_confirmed=TRUE, awaiting_user_id=NULL, updated_at=NOW() WHERE id=$1`, [s.id]);
      await logSwapEvent(db, s.id, null, 'SCHEDULED', `Calendar event ${ev.eventId}`);
      const when = new Date(sess.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      for (const uid of [s.proposer_id, s.recipient_id])
        await notify(db, uid, 'SCHEDULE', `You’re booked for ${when}. We’ll send a reminder before it starts.`, `/swaps/${s.id}`);
    } else {
      await db.query(`UPDATE swaps SET proposer_confirmed=$1, recipient_confirmed=$2, awaiting_user_id=$3, updated_at=NOW() WHERE id=$4`,
        [pc, rc, otherParty(s, req.user.id), s.id]);
      await notify(db, otherParty(s, req.user.id), 'SCHEDULE', `${firstName(req.user.name)} confirmed the time. Your confirmation books it.`, `/swaps/${s.id}`);
    }
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// reschedule() self-transition on SCHEDULED (REQ-13)
router.post('/:id/reschedule', ah(async (req, res) => {
  const v = validateSession(req.body);
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'SCHEDULED');
    const sess = (await db.query(`SELECT * FROM sessions WHERE swap_id=$1 AND status='SCHEDULED' ORDER BY created_at DESC LIMIT 1`, [s.id])).rows[0];
    const d = await swapDetail(s.id, db);
    const ev = calendar.createEvent({
      title: `SkillSwap: ${d.requested.skill}${d.offered?.skill ? ' ⇄ ' + d.offered.skill : ''}`,
      details: `Rescheduled skill swap between ${d.proposer.name} and ${d.recipient.name}.`,
      start: v.when, durationHours: v.dur, location: v.mode === 'IN_PERSON' ? v.place : 'Online',
    });
    await db.query(
      `UPDATE sessions SET scheduled_at=$1, duration_hours=$2, mode=$3, place=$4, meeting_link=$5,
         calendar_event_id=$6, calendar_url=$7, reschedule_count=reschedule_count+1 WHERE id=$8`,
      [v.when, v.dur, v.mode, v.place, v.meetingLink, ev.eventId, ev.url, sess.id]);
    await db.query('UPDATE swaps SET updated_at=NOW() WHERE id=$1', [s.id]);
    await logSwapEvent(db, s.id, req.user.id, 'RESCHEDULED', v.when.toISOString());
    await notify(db, otherParty(s, req.user.id), 'SCHEDULE', `${firstName(req.user.name)} moved your session. Check the new time.`, `/swaps/${s.id}`);
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// cancel() → CANCELLED, escrow refunded
router.post('/:id/cancel', ah(async (req, res) => {
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'ACCEPTED', 'SCHEDULED');
    await credits.refund(db, s.proposer_id, s.credits_offered, s.id);
    await db.query(`UPDATE sessions SET status='CANCELLED' WHERE swap_id=$1 AND status IN ('PROPOSED','SCHEDULED')`, [s.id]);
    await db.query(`UPDATE swaps SET status='CANCELLED', awaiting_user_id=NULL, updated_at=NOW() WHERE id=$1`, [s.id]);
    await logSwapEvent(db, s.id, req.user.id, 'CANCELLED', req.body.reason || '');
    await notify(db, otherParty(s, req.user.id), 'SCHEDULE', `${firstName(req.user.name)} cancelled the session${req.body.reason ? `: “${req.body.reason}”` : '.'}`, `/swaps/${s.id}`);
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// Both users mark complete → COMPLETED, escrow released to the provider
router.post('/:id/complete', ah(async (req, res) => {
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'SCHEDULED');
    const dispute = await db.query(`SELECT 1 FROM disputes WHERE swap_id=$1 AND status='OPEN'`, [s.id]);
    if (dispute.rowCount) throw new HttpError(409, 'This swap has an open dispute. An admin will resolve it.');
    const col = s.proposer_id === req.user.id ? 'proposer_completed' : 'recipient_completed';
    const { rows } = await db.query(`UPDATE swaps SET ${col}=TRUE, updated_at=NOW() WHERE id=$1 RETURNING *`, [s.id]);
    const u = rows[0];
    await logSwapEvent(db, s.id, req.user.id, 'MARKED_COMPLETE');
    if (u.proposer_completed && u.recipient_completed) {
      await credits.release(db, s.proposer_id, s.recipient_id, s.credits_offered, s.id);
      await db.query(`UPDATE sessions SET status='COMPLETED' WHERE swap_id=$1 AND status='SCHEDULED'`, [s.id]);
      await db.query(`UPDATE swaps SET status='COMPLETED', completed_at=NOW() WHERE id=$1`, [s.id]);
      await logSwapEvent(db, s.id, null, 'COMPLETED', s.credits_offered ? `${s.credits_offered} credits released` : '');
      for (const uid of [s.proposer_id, s.recipient_id])
        await notify(db, uid, 'REVIEW', 'Swap complete. How did it go? Leave a rating for your partner.', `/swaps/${s.id}`);
    } else {
      await notify(db, otherParty(s, req.user.id), 'SWAP', `${firstName(req.user.name)} marked the swap as done. Mark it on your side when you’re ready.`, `/swaps/${s.id}`);
    }
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// rateAndReview() (REQ-20, REQ-21). When both have reviewed → CLOSED.
router.post('/:id/review', ah(async (req, res) => {
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Choose a rating from 1 to 5.');
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'COMPLETED');
    const reviewee = otherParty(s, req.user.id);
    const dup = await db.query('SELECT 1 FROM reviews WHERE swap_id=$1 AND reviewer_id=$2', [s.id, req.user.id]);
    if (dup.rowCount) throw new HttpError(409, 'You’ve already reviewed this swap.');
    await db.query('INSERT INTO reviews (swap_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1,$2,$3,$4,$5)',
      [s.id, req.user.id, reviewee, rating, (req.body.comment || '').trim()]);
    await logSwapEvent(db, s.id, req.user.id, 'REVIEWED', `${rating}★`);
    await notify(db, reviewee, 'REVIEW', `${firstName(req.user.name)} left you a ${rating}-star review.`, `/u/${reviewee}`);
    const count = await db.query('SELECT COUNT(*)::int AS n FROM reviews WHERE swap_id=$1', [s.id]);
    if (count.rows[0].n >= 2) {
      await db.query(`UPDATE swaps SET status='CLOSED', updated_at=NOW() WHERE id=$1`, [s.id]);
      await logSwapEvent(db, s.id, null, 'CLOSED');
    }
  });
  res.json({ swap: await swapDetail(req.params.id) });
}));

// File a dispute (use case 29) — blocks completion until an admin resolves it
router.post('/:id/dispute', ah(async (req, res) => {
  const reason = (req.body.reason || '').trim();
  if (reason.length < 10) throw new HttpError(400, 'Tell us what happened in a sentence or two.');
  await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id, true);
    requireStatus(s, 'SCHEDULED', 'COMPLETED');
    const open = await db.query(`SELECT 1 FROM disputes WHERE swap_id=$1 AND status='OPEN'`, [s.id]);
    if (open.rowCount) throw new HttpError(409, 'There’s already an open dispute for this swap.');
    await db.query('INSERT INTO disputes (swap_id, filed_by, reason) VALUES ($1,$2,$3)', [s.id, req.user.id, reason]);
    await logSwapEvent(db, s.id, req.user.id, 'DISPUTE_FILED', reason);
    await notify(db, otherParty(s, req.user.id), 'DISPUTE', 'A dispute was opened on your swap. An admin will review it shortly.', `/swaps/${s.id}`);
    const admins = await db.query(`SELECT id FROM users WHERE role='admin'`);
    for (const a of admins.rows) await notify(db, a.id, 'DISPUTE', `New dispute on swap #${s.id}.`, '/admin');
  });
  res.json({ ok: true });
}));

// In-app messaging tied to a swap (REQ-14, REQ-17)
router.get('/:id/messages', ah(async (req, res) => {
  await loadSwap({ query }, req.params.id, req.user.id);
  const after = parseInt(req.query.after, 10) || 0;
  const { rows } = await query(
    `SELECT m.id, m.content, m.is_flagged, m.sent_at, m.sender_id, u.name AS sender, u.avatar_color
     FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.swap_id=$1 AND m.id>$2 ORDER BY m.id`,
    [req.params.id, after]);
  res.json({ messages: rows });
}));

router.post('/:id/messages', ah(async (req, res) => {
  const text = (req.body.content || '').trim();
  if (!text) throw new HttpError(400, 'Write a message first.');
  if (text.length > 2000) throw new HttpError(400, 'Keep messages under 2000 characters.');
  const msg = await tx(async (db) => {
    const s = await loadSwap(db, req.params.id, req.user.id);
    if (s.status === 'DRAFT') throw new HttpError(409, 'Send the proposal before messaging.');
    const { clean, flagged } = filterMessage(text);
    const { rows } = await db.query(
      'INSERT INTO messages (swap_id, sender_id, content, is_flagged) VALUES ($1,$2,$3,$4) RETURNING *', [s.id, req.user.id, clean, flagged]);
    await notify(db, otherParty(s, req.user.id), 'MESSAGE', `New message from ${firstName(req.user.name)}: “${clean.slice(0, 60)}${clean.length > 60 ? '…' : ''}”`, `/messages/${s.id}`);
    return rows[0];
  });
  res.status(201).json({ message: { ...msg, sender: req.user.name }, filtered: msg.is_flagged });
}));

module.exports = router;
