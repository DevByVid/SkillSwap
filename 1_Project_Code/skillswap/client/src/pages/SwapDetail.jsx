import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, when } from '../api';
import { useAuth } from '../auth';
import { Empty, ErrorBox, Field, Loading, Modal, Person, Status, useToast } from '../components/ui';
import SwapTicket from '../components/SwapTicket';
import Chat from '../components/Chat';

const JOURNEY = [['PROPOSED', 'Proposed'], ['ACCEPTED', 'Agreed'], ['SCHEDULED', 'Booked'], ['COMPLETED', 'Done'], ['CLOSED', 'Reviewed']];
const ORDER = { DRAFT: -1, PROPOSED: 0, NEGOTIATING: 0, ACCEPTED: 1, SCHEDULED: 2, COMPLETED: 3, CLOSED: 4 };

const EVENT_TEXT = {
  CREATED: 'created the proposal', PROPOSED: 'sent the proposal', COUNTERED: 'sent a counter-offer', ACCEPTED: 'accepted',
  DECLINED: 'declined', TIME_PROPOSED: 'suggested a time', CONFIRMED: 'confirmed the time', SCHEDULED: 'Session booked and added to calendar',
  RESCHEDULED: 'moved the session', CANCELLED: 'cancelled', MARKED_COMPLETE: 'marked the swap complete', COMPLETED: 'Swap completed',
  REVIEWED: 'left a review', CLOSED: 'Both reviews in. Swap closed.', DISPUTE_FILED: 'opened a dispute', DISPUTE_RESOLVED: 'resolved the dispute',
};

function toLocalInput(d) {
  const dt = new Date(d);
  dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
  return dt.toISOString().slice(0, 16);
}

function SessionForm({ initial, submitLabel, onSubmit, onCancel }) {
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(17, 0, 0, 0);
  const [f, setF] = useState({
    scheduledAt: toLocalInput(initial?.scheduled_at || tomorrow), durationHours: initial?.duration_hours || 1,
    mode: initial?.mode || 'VIRTUAL', place: initial?.place || '', meetingLink: initial?.meeting_link || '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await onSubmit({ ...f, scheduledAt: new Date(f.scheduledAt).toISOString() }); } catch (err) { setError(err.message); }
  };
  return (
    <form onSubmit={submit}>
      <ErrorBox error={error} />
      <div className="segmented" role="group" aria-label="Where" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={f.mode === 'VIRTUAL'} onClick={() => setF({ ...f, mode: 'VIRTUAL' })}>Online</button>
        <button type="button" aria-pressed={f.mode === 'IN_PERSON'} onClick={() => setF({ ...f, mode: 'IN_PERSON' })}>In person</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <Field label="Date and time"><input className="input" type="datetime-local" required value={f.scheduledAt} onChange={set('scheduledAt')} /></Field>
        <Field label="Length">
          <select className="input" value={f.durationHours} onChange={set('durationHours')}>
            {[0.5, 1, 1.5, 2, 3].map((h) => <option key={h} value={h}>{h < 1 ? '30 min' : `${h} h`}</option>)}
          </select>
        </Field>
      </div>
      {f.mode === 'IN_PERSON' ? (
        <Field label="Meeting place" hint="Please pick a public place, like a café, library or park.">
          <input className="input" required value={f.place} onChange={set('place')} placeholder="e.g. Café Coffee Day, Vijay Nagar" />
        </Field>
      ) : (
        <Field label="Video call link" hint="Optional. Paste a Google Meet or Zoom link, or add it later in chat.">
          <input className="input" type="url" value={f.meetingLink} onChange={set('meetingLink')} placeholder="https://meet.google.com/…" />
        </Field>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary">{submitLabel}</button>
      </div>
    </form>
  );
}

function SessionInfo({ session }) {
  return (
    <div className="card" style={{ background: '#fff5f8' }}>
      <div className="faint">{session.status === 'PROPOSED' ? 'Suggested time' : 'Your session'}</div>
      <h3 style={{ margin: '4px 0 6px' }}>{when(session.scheduled_at, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {session.duration_hours < 1 ? '30 minutes' : `${Number(session.duration_hours)} hour${session.duration_hours > 1 ? 's' : ''}`},{' '}
        {session.mode === 'IN_PERSON' ? `at ${session.place}` : 'online'}
        {session.reschedule_count > 0 && ` (moved ${session.reschedule_count}×)`}
      </p>
      {session.mode === 'IN_PERSON' && session.status !== 'COMPLETED' && (
        <p className="faint" style={{ margin: '8px 0 0' }}>Safety first: meet in a public place, tell a friend where you’re going, and leave if anything feels off.</p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {session.calendar_url && session.status === 'SCHEDULED' && <a className="btn btn-soft btn-sm" href={session.calendar_url} target="_blank" rel="noreferrer">Add to Google Calendar</a>}
        {session.meeting_link && session.status === 'SCHEDULED' && <a className="btn btn-ghost btn-sm" href={session.meeting_link} target="_blank" rel="noreferrer">Join call</a>}
      </div>
    </div>
  );
}

function CounterModal({ swap, me, onClose, act }) {
  const [credits, setCredits] = useState(swap.credits_offered);
  const [offered, setOffered] = useState(swap.offered?.id ? String(swap.offered.id) : '');
  const [message, setMessage] = useState('');
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const proposerFirst = swap.proposer.name.split(' ')[0];
  const iAmProposer = swap.proposer.id === me;

  useEffect(() => {
    api(`/users/${swap.proposer.id}`).then((d) => setOptions(d.listings.filter((l) => l.type === 'OFFER')));
  }, [swap.proposer.id]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await act('respond', { action: 'counter', credits: Number(credits), offeredListingId: offered ? Number(offered) : null, message }); onClose(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title="Suggest different terms" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Change what {iAmProposer ? 'you teach' : `${proposerFirst} teaches`} in return, or how many credits {iAmProposer ? 'you add' : `${proposerFirst} adds`}.</p>
        <ErrorBox error={error} />
        <Field label={iAmProposer ? 'You’ll teach' : `${proposerFirst} teaches`}>
          <select className="input" value={offered} onChange={(e) => setOffered(e.target.value)}>
            <option value="">No skill, credits only</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.skill}</option>)}
          </select>
        </Field>
        <Field label="Credits" hint="Paid by the person who sent the proposal, held until the swap is complete.">
          <input className="input" type="number" min="0" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </Field>
        <Field label="Why the change?"><textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. A full website is a few sessions, could you add a credit?" /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Send counter-offer</button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewForm({ partner, act }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await act('review', { rating, comment }); } catch (err) { setError(err.message); }
  };
  return (
    <form onSubmit={submit}>
      <h3>How was learning with {partner.name.split(' ')[0]}?</h3>
      <ErrorBox error={error} />
      <div className="row" role="radiogroup" aria-label="Rating" style={{ gap: 4, marginBottom: 14 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)} className="icon-btn" style={{ fontSize: '1.7rem', color: n <= rating ? '#d9688e' : 'var(--petal)' }}>★</button>
        ))}
      </div>
      <Field label="A few words for the community" hint="Optional. Be honest and kind.">
        <textarea className="input" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <button className="btn btn-primary" disabled={!rating}>Post review</button>
    </form>
  );
}

export default function SwapDetail() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => api(`/swaps/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, body, msg) => {
    setActionError('');
    await api(`/swaps/${id}/${path}`, { method: 'POST', body });
    await Promise.all([load(), refresh()]);
    if (msg) toast(msg);
  };
  const safely = (fn) => async () => { try { await fn(); } catch (e) { setActionError(e.message); } };

  if (error) return <main className="wrap page"><Empty title="We couldn’t open this swap">{error}</Empty></main>;
  if (!data) return <main className="wrap page"><Loading /></main>;

  const { swap, session, events, reviews, dispute } = data;
  const me = user.id;
  const isProposer = swap.proposer.id === me;
  const partner = isProposer ? swap.recipient : swap.proposer;
  const pFirst = partner.name.split(' ')[0];
  const myTurn = swap.awaiting_user_id === me;
  const myReview = reviews.find((r) => r.reviewer_id === me);
  const partnerReview = reviews.find((r) => r.reviewer_id !== me);
  const iCompleted = isProposer ? swap.proposer_completed : swap.recipient_completed;
  const ended = ['DECLINED', 'CANCELLED'].includes(swap.status);
  const openDispute = dispute?.status === 'OPEN';

  let panel;
  switch (swap.status) {
    case 'DRAFT':
      panel = (
        <>
          <h3>This proposal is still a draft</h3>
          <p className="muted">{pFirst} can’t see it until you send it.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={safely(() => act('send', {}, 'Proposal sent'))}>Send proposal</button>
            <button className="btn btn-ghost" onClick={safely(async () => { await api(`/swaps/${id}`, { method: 'DELETE' }); nav('/swaps'); })}>Delete draft</button>
          </div>
        </>
      );
      break;
    case 'PROPOSED':
    case 'NEGOTIATING':
      panel = myTurn ? (
        <>
          <h3>{swap.status === 'PROPOSED' ? `${pFirst} would like to swap with you` : `${pFirst} suggested new terms`}</h3>
          <p className="muted">Accept to start planning a time, suggest different terms, or decline politely.</p>
          <div className="row">
            <button className="btn btn-primary" onClick={safely(() => act('respond', { action: 'accept' }, 'Swap accepted'))}>Accept</button>
            <button className="btn btn-soft" onClick={() => setModal('counter')}>Suggest changes</button>
            <button className="btn btn-ghost" onClick={safely(() => act('respond', { action: 'decline' }, 'Proposal declined'))}>Decline</button>
          </div>
        </>
      ) : (
        <>
          <h3>Waiting for {pFirst} to reply</h3>
          <p className="muted" style={{ margin: 0 }}>We’ll notify you as soon as they accept, decline or suggest changes.{swap.credits_offered > 0 && isProposer && ` Your ${swap.credits_offered} credit${swap.credits_offered > 1 ? 's are' : ' is'} held safely in the meantime.`}</p>
        </>
      );
      break;
    case 'ACCEPTED':
      panel = session?.status === 'PROPOSED' ? (
        <>
          <SessionInfo session={session} />
          {myTurn ? (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={safely(() => act('confirm', {}, 'Session booked'))}>Confirm this time</button>
              <button className="btn btn-soft" onClick={() => setModal('time')}>Suggest another time</button>
            </div>
          ) : <p className="muted" style={{ marginTop: 14 }}>Waiting for {pFirst} to confirm.</p>}
        </>
      ) : (
        <>
          <h3>You’ve agreed. Now pick a time.</h3>
          <p className="muted">Suggest a slot that works for you. {pFirst} confirms it, and we add it to both your calendars.</p>
          <SessionForm submitLabel="Suggest this time" onSubmit={(b) => act('session', b, 'Time suggested')} />
        </>
      );
      break;
    case 'SCHEDULED':
      panel = (
        <>
          <SessionInfo session={session} />
          {openDispute ? (
            <div className="alert alert-info" style={{ marginTop: 16 }}>A dispute is open on this swap. An admin will review it and decide what happens to any held credits.</div>
          ) : iCompleted ? (
            <p className="muted" style={{ marginTop: 14 }}>You’ve marked it complete. Waiting for {pFirst} to do the same.</p>
          ) : (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={safely(() => act('complete', {}, 'Marked as complete'))}>We’ve had our session</button>
              <button className="btn btn-soft" onClick={() => setModal('reschedule')}>Reschedule</button>
              <button className="btn btn-ghost" onClick={() => setModal('cancel')}>Cancel session</button>
            </div>
          )}
        </>
      );
      break;
    case 'COMPLETED':
      panel = myReview ? (
        <><h3>Thanks for your review</h3><p className="muted" style={{ margin: 0 }}>Waiting for {pFirst} to leave theirs. Then this swap is closed.</p></>
      ) : <ReviewForm partner={partner} act={(p, b) => act(p, b, 'Review posted')} />;
      break;
    case 'CLOSED':
      panel = (
        <>
          <h3>Swap complete</h3>
          <p className="muted">You both showed up and shared something. That’s the whole idea.</p>
          {partnerReview && (
            <blockquote className="card" style={{ margin: 0 }}>
              <div className="stars">{'★'.repeat(partnerReview.rating)}<span className="off">{'★'.repeat(5 - partnerReview.rating)}</span></div>
              {partnerReview.comment && <p style={{ margin: '8px 0 0', fontFamily: 'var(--serif)' }}>“{partnerReview.comment}”</p>}
              <span className="faint">{pFirst} about you</span>
            </blockquote>
          )}
        </>
      );
      break;
    default:
      panel = (
        <>
          <h3>This swap was {swap.status.toLowerCase()}</h3>
          <p className="muted" style={{ margin: 0 }}>{swap.credits_offered > 0 ? 'Any held credits went back to the sender. ' : ''}You can always propose again from their profile.</p>
        </>
      );
  }

  return (
    <main className="wrap page">
      <p><Link to="/swaps">All swaps</Link></p>
      <div className="spread" style={{ marginBottom: 18 }}>
        <Person user={partner} size={48} sub={`${isProposer ? 'You sent this proposal' : 'Sent to you'}, swap #${swap.id}`} />
        <Status s={swap.status} />
      </div>
      <SwapTicket swap={swap} me={me} link={false} />

      {!ended && swap.status !== 'DRAFT' && (
        <ol className="journey" aria-label="Swap progress" style={{ margin: '24px 0 8px' }}>
          {JOURNEY.map(([k, label], i) => {
            const cur = ORDER[swap.status];
            return <li key={k} className={i < cur || (i === cur && swap.status === 'CLOSED') ? 'done' : i === cur ? 'now' : ''}>{label}</li>;
          })}
        </ol>
      )}

      <div className="swap-layout" style={{ marginTop: 24 }}>
        <div className="stack">
          <section className="panel">
            <ErrorBox error={actionError} />
            {panel}
          </section>

          {swap.message && (
            <section className="card">
              <div className="faint" style={{ marginBottom: 6 }}>{isProposer ? 'Your note' : `${swap.proposer.name.split(' ')[0]}’s note`}</div>
              <p style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: '1.08rem' }}>“{swap.message}”</p>
            </section>
          )}

          {dispute && (
            <section className="card">
              <h3>Dispute {dispute.status === 'OPEN' ? 'under review' : 'resolved'}</h3>
              <p className="muted">{dispute.reason}</p>
              {dispute.resolution && <p style={{ margin: 0 }}><strong>Decision:</strong> {dispute.resolution}</p>}
            </section>
          )}

          <section className="card">
            <h3>History</h3>
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  {e.actor ? <><strong>{e.actor_id === me ? 'You' : e.actor.split(' ')[0]}</strong> {EVENT_TEXT[e.event] || e.event}</> : EVENT_TEXT[e.event] || e.event}
                  {e.detail && !['TIME_PROPOSED', 'RESCHEDULED', 'SCHEDULED'].includes(e.event) && <span className="muted">: {e.detail}</span>}
                  <div className="faint">{when(e.created_at)}</div>
                </li>
              ))}
            </ul>
          </section>

          {['SCHEDULED', 'COMPLETED'].includes(swap.status) && !openDispute && (
            <p className="faint">Something went wrong with this swap? <button className="btn-link" onClick={() => setModal('dispute')}>Open a dispute</button></p>
          )}
        </div>

        <Chat swapId={swap.id} partner={partner} me={me} disabled={swap.status === 'DRAFT'} />
      </div>

      {modal === 'counter' && <CounterModal swap={swap} me={me} act={(p, b) => act(p, b, 'Counter-offer sent')} onClose={() => setModal(null)} />}
      {(modal === 'time' || modal === 'reschedule') && (
        <Modal title={modal === 'time' ? 'Suggest another time' : 'Move your session'} onClose={() => setModal(null)}>
          <SessionForm initial={session} submitLabel={modal === 'time' ? 'Suggest this time' : 'Save new time'} onCancel={() => setModal(null)}
            onSubmit={async (b) => { await act(modal === 'time' ? 'session' : 'reschedule', b, modal === 'time' ? 'Time suggested' : 'Session moved'); setModal(null); }} />
        </Modal>
      )}
      {modal === 'cancel' && <ReasonModal title="Cancel this session?" label="Let them know why (optional)" button="Cancel session" danger optional
        intro={`${pFirst} will be notified${swap.credits_offered ? ' and held credits return to the sender' : ''}. This can’t be undone.`}
        onClose={() => setModal(null)} onSubmit={(reason) => act('cancel', { reason }, 'Session cancelled')} />}
      {modal === 'dispute' && <ReasonModal title="Open a dispute" label="What went wrong?" button="Open dispute"
        intro="An admin will look at the messages and history, then decide what happens to any held credits. Completion is paused until then."
        onClose={() => setModal(null)} onSubmit={(reason) => act('dispute', { reason }, 'Dispute opened')} />}
    </main>
  );
}

function ReasonModal({ title, intro, label, button, danger, optional, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await onSubmit(reason); onClose(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">{intro}</p>
        <ErrorBox error={error} />
        <Field label={label}><textarea className="input" required={!optional} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Go back</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>{button}</button>
        </div>
      </form>
    </Modal>
  );
}
