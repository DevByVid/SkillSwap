import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ago } from '../api';
import { useAuth } from '../auth';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, Stars, Verified, useToast } from '../components/ui';
import { ListingCard } from '../components/Propose';

function ReportModal({ user, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/reports', { method: 'POST', body: { userId: user.id, reason } }); toast('Report sent to our team'); onClose(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Report ${user.name.split(' ')[0]}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Reports are private. An admin will review it and may warn, suspend or ban the account.</p>
        <ErrorBox error={error} />
        <Field label="What happened?"><textarea className="input" required minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger">Send report</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);

  useEffect(() => { setData(null); api(`/users/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  if (error) return <main className="wrap page"><Empty title="Profile not found">{error}</Empty></main>;
  if (!data) return <main className="wrap page"><Loading /></main>;
  const { user, listings, reviews } = data;
  const isMe = me?.id === user.id;
  const offers = listings.filter((l) => l.type === 'OFFER').map((l) => ({ ...l, user_id: user.id, user_name: user.name, availability: user.availability }));
  const wants = listings.filter((l) => l.type === 'WANT');

  return (
    <main className="wrap page">
      <section className="panel profile-head" style={{ marginBottom: 32 }}>
        <Avatar name={user.name} color={user.avatar_color} size={96} />
        <div>
          <h1 style={{ marginBottom: 6 }}>{user.name}{user.trust_badge && <Verified />}</h1>
          <p className="muted" style={{ marginBottom: 8 }}>
            {[user.location, user.availability && `Free ${user.availability.toLowerCase()}`].filter(Boolean).join('. ')}
          </p>
          <div className="row"><Stars value={user.rating} count={user.review_count} /><span className="faint">{user.swaps_done} swaps done</span></div>
          {user.bio && <p style={{ margin: '14px 0 0', maxWidth: '62ch' }}>{user.bio}</p>}
        </div>
        <div className="row">
          {isMe ? <Link to="/settings" className="btn btn-soft">Edit profile</Link>
            : me && <button className="btn btn-ghost btn-sm" onClick={() => setReporting(true)}>Report</button>}
        </div>
      </section>

      <div className="section-title"><h2>{isMe ? 'You can teach' : `${user.name.split(' ')[0]} can teach`}</h2></div>
      {offers.length ? <div className="grid g3">{offers.map((l) => <ListingCard key={l.id} l={l} showPerson={false} />)}</div>
        : <p className="muted">Nothing listed yet.</p>}

      <div className="section-title"><h2>Wants to learn</h2></div>
      {wants.length ? <div className="row">{wants.map((w) => <span key={w.id} className="chip chip-learn">{w.skill}</span>)}</div>
        : <p className="muted">Nothing listed yet.</p>}

      <div className="section-title"><h2>What partners say</h2></div>
      {reviews.length === 0 ? <p className="muted">No reviews yet. Every review comes from a real, completed swap.</p> : (
        <div className="grid g2">
          {reviews.map((r, i) => (
            <figure key={i} className="card" style={{ margin: 0 }}>
              <Stars value={r.rating} />
              {r.comment && <blockquote style={{ margin: '10px 0', fontFamily: 'var(--serif)', fontSize: '1.1rem' }}>“{r.comment}”</blockquote>}
              <figcaption className="row" style={{ gap: 8 }}>
                <Avatar name={r.reviewer} color={r.avatar_color} size={26} />
                <Link to={`/u/${r.reviewer_id}`} className="person-name" style={{ fontSize: '.9rem' }}>{r.reviewer}</Link>
                <span className="faint">{ago(r.created_at)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {reporting && <ReportModal user={user} onClose={() => setReporting(false)} />}
    </main>
  );
}
