import { Link } from 'react-router-dom';
import { SwapArrows, Status } from './ui';

// The ticket shows both halves of a swap: who teaches what.
export default function SwapTicket({ swap, me, link = true }) {
  const first = (u) => (u.id === me ? 'You' : u.name.split(' ')[0]);
  const inner = (
    <>
      <div className="ticket-side">
        <div className="who">{first(swap.recipient)} {swap.recipient.id === me ? 'teach' : 'teaches'}</div>
        <div className="skill">{swap.requested?.skill || 'A skill'}</div>
        {link && <div style={{ marginTop: 10 }}><Status s={swap.status} /></div>}
      </div>
      <div className="ticket-mid"><SwapArrows /></div>
      <div className="ticket-side">
        <div className="who">{first(swap.proposer)} {swap.proposer.id === me ? 'teach' : 'teaches'}</div>
        <div className="skill">{swap.offered?.skill || <span className="muted">Credits only</span>}</div>
        {swap.credits_offered > 0 && <div className="extra">+ {swap.credits_offered} credit{swap.credits_offered > 1 ? 's' : ''}</div>}
      </div>
    </>
  );
  return link ? <Link to={`/swaps/${swap.id}`} className="ticket">{inner}</Link> : <div className="ticket">{inner}</div>;
}

// What does this swap need from me right now?
export function nextStep(s, me) {
  const isProposer = s.proposer.id === me;
  switch (s.status) {
    case 'DRAFT': return 'Finish and send your draft';
    case 'PROPOSED':
    case 'NEGOTIATING': return s.awaiting_user_id === me ? 'Reply to this proposal' : 'Waiting for their reply';
    case 'ACCEPTED':
      if (!s.session || s.session.status !== 'PROPOSED') return 'Suggest a time to meet';
      return s.awaiting_user_id === me ? 'Confirm the suggested time' : 'Waiting for them to confirm the time';
    case 'SCHEDULED': {
      const done = isProposer ? s.proposer_completed : s.recipient_completed;
      return done ? 'Waiting for them to mark it complete' : 'Mark complete after your session';
    }
    case 'COMPLETED': return s.i_reviewed ? 'Waiting for their review' : 'Leave a review';
    default: return null;
  }
}

export function needsMe(s, me) {
  const isProposer = s.proposer.id === me;
  if (['PROPOSED', 'NEGOTIATING'].includes(s.status)) return s.awaiting_user_id === me;
  if (s.status === 'ACCEPTED') return !s.session || s.session.status !== 'PROPOSED' || s.awaiting_user_id === me;
  if (s.status === 'SCHEDULED') return !(isProposer ? s.proposer_completed : s.recipient_completed) && new Date(s.session?.scheduled_at) < new Date();
  if (s.status === 'COMPLETED') return !s.i_reviewed;
  if (s.status === 'DRAFT') return true;
  return false;
}
