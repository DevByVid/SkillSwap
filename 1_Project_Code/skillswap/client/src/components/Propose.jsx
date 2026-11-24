import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Chip, ErrorBox, Field, Level, Modal, Person, Stars, useToast } from './ui';

// Card for someone's listing; "Propose a swap" opens the proposal modal (REQ-9, REQ-11)
export function ListingCard({ l, showPerson = true }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const mine = user && user.id === l.user_id;
  return (
    <article className="card listing">
      {showPerson && (
        <Person user={{ id: l.user_id, name: l.user_name, avatar_color: l.avatar_color, trust_badge: l.trust_badge }}
          sub={[l.location, l.near_you && 'near you'].filter(Boolean).join(', ')} />
      )}
      <div>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <Chip type={l.type}>{l.type === 'OFFER' ? 'Can teach' : 'Wants to learn'}</Chip>
          <Level level={l.level} />
        </div>
        <h3>{l.skill}</h3>
        <span className="faint">{l.category}</span>
      </div>
      {l.description && <p>{l.description}</p>}
      <footer>
        {showPerson ? <Stars value={l.rating} count={l.review_count} /> : <span className="faint">{l.availability}</span>}
        {l.type === 'OFFER' && !mine && (
          <button className="btn btn-primary btn-sm" onClick={() => (user ? setOpen(true) : nav('/login', { state: { from: '/explore' } }))}>
            Propose a swap
          </button>
        )}
      </footer>
      {open && <ProposeModal listing={l} onClose={() => setOpen(false)} />}
    </article>
  );
}

export function ProposeModal({ listing, onClose }) {
  const { user, refresh } = useAuth();
  const [mine, setMine] = useState(null);
  const [offered, setOffered] = useState('');
  const [credits, setCredits] = useState(0);
  const [message, setMessage] = useState(`Hi ${listing.user_name?.split(' ')[0] || ''}! I’d love to learn ${listing.skill} from you.`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => {
    api('/listings/mine').then((d) => {
      const offers = d.listings.filter((x) => x.type === 'OFFER');
      setMine(offers);
      if (offers[0]) setOffered(String(offers[0].id));
    });
  }, []);

  const submit = async (draft) => {
    setBusy(true); setError('');
    try {
      const { swap } = await api('/swaps', {
        method: 'POST',
        body: { requestedListingId: listing.id, offeredListingId: offered ? Number(offered) : null, credits: Number(credits), message, draft },
      });
      await refresh();
      toast(draft ? 'Draft saved' : 'Proposal sent');
      onClose();
      nav(`/swaps/${swap.id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title="Propose a swap" onClose={onClose}>
      <p className="muted">You’re asking to learn <strong>{listing.skill}</strong> from {listing.user_name}. Offer one of your skills in return, add credits if the exchange feels uneven, or both.</p>
      <ErrorBox error={error} />
      {mine === null ? <p className="faint">Loading your skills…</p> : (
        <>
          <Field label="What you’ll teach in return" hint={mine.length ? null : <>You haven’t listed anything you can teach yet. <Link to="/my-skills">Add a skill</Link>, or pay with credits.</>}>
            <select className="input" value={offered} onChange={(e) => setOffered(e.target.value)}>
              <option value="">Nothing, I’ll pay with credits</option>
              {mine.map((m) => <option key={m.id} value={m.id}>{m.skill}</option>)}
            </select>
          </Field>
          <Field label="Credits to add" hint={`You have ${user?.balance ?? 0} available. They’re held safely until you both mark the swap complete.`}>
            <input className="input" type="number" min="0" max={user?.balance ?? 0} value={credits} onChange={(e) => setCredits(e.target.value)} />
          </Field>
          <Field label="A note to introduce yourself">
            <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={600} />
          </Field>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" disabled={busy} onClick={() => submit(true)}>Save as draft</button>
            <button className="btn btn-primary" disabled={busy || (!offered && Number(credits) <= 0)} onClick={() => submit(false)}>Send proposal</button>
          </div>
        </>
      )}
    </Modal>
  );
}
