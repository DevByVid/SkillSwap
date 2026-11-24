import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, when } from '../api';
import { useAuth } from '../auth';
import { Empty, Loading, Person, Stars, SwapArrows } from '../components/ui';
import SwapTicket, { needsMe, nextStep } from '../components/SwapTicket';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { user } = useAuth();
  const [swaps, setSwaps] = useState(null);
  const [matches, setMatches] = useState(null);

  useEffect(() => {
    api('/swaps').then((d) => setSwaps(d.swaps));
    api('/matches').then(setMatches);
  }, []);

  if (!swaps || !matches) return <main className="wrap page"><Loading /></main>;

  const todo = swaps.filter((s) => needsMe(s, user.id));
  const upcoming = swaps
    .filter((s) => s.status === 'SCHEDULED' && s.session && new Date(s.session.scheduled_at) > new Date())
    .sort((a, b) => new Date(a.session.scheduled_at) - new Date(b.session.scheduled_at));
  const next = upcoming[0];
  const partner = next && (next.proposer.id === user.id ? next.recipient : next.proposer);
  const active = swaps.filter((s) => ['PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SCHEDULED'].includes(s.status)).length;
  const done = swaps.filter((s) => ['COMPLETED', 'CLOSED'].includes(s.status)).length;

  return (
    <main className="wrap page">
      {!user.email_verified && (
        <div className="alert alert-info spread">
          <span>Verify your email to unlock the trust badge.</span>
          <Link to="/settings">Verify now</Link>
        </div>
      )}
      <div className="dash">
        <div>
          <div className="greet">
            <h1>{greeting()}, {user.name.split(' ')[0]}</h1>
            <p className="muted">
              {todo.length ? `${todo.length} swap${todo.length > 1 ? 's need' : ' needs'} you today.` : 'You’re all caught up. Maybe find someone new to learn from?'}
            </p>
          </div>

          <div className="section-title"><h2>Waiting on you</h2>{swaps.length > 0 && <Link to="/swaps">All swaps</Link>}</div>
          {todo.length === 0 ? (
            <Empty title="Nothing waiting on you" action={<Link to="/explore" className="btn btn-soft">Explore skills</Link>}>
              New proposals and session confirmations will show up here.
            </Empty>
          ) : (
            <div className="stack">
              {todo.slice(0, 5).map((s) => (
                <div key={s.id}>
                  <SwapTicket swap={s} me={user.id} />
                  <p className="faint" style={{ margin: '6px 4px 0' }}>{nextStep(s, user.id)}</p>
                </div>
              ))}
            </div>
          )}

          <div className="section-title"><h2>People you might swap with</h2><Link to="/explore">Search everything</Link></div>
          {matches.needsListings ? (
            <Empty title="Add your skills to get matches" action={<Link to="/my-skills" className="btn btn-primary">Add my skills</Link>}>
              We match you with people who want what you teach and teach what you want.
            </Empty>
          ) : matches.matches.length === 0 ? (
            <Empty title="No matches yet">Try adding a few more skills you’d like to learn. The community grows every week.</Empty>
          ) : (
            <div className="grid g2">
              {matches.matches.slice(0, 6).map((m) => (
                <article key={m.user.id} className="card match-card">
                  <div className="spread">
                    <Person user={m.user} sub={m.user.location} />
                    {m.mutual && <span className="hand" style={{ fontSize: '1.15rem' }}>perfect pair</span>}
                  </div>
                  <ul>{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <div className="spread" style={{ marginTop: 'auto' }}>
                    <Stars value={m.user.rating} count={m.user.review_count} />
                    <Link to={`/u/${m.user.id}`} className="btn btn-soft btn-sm">View profile</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="stack">
          {next ? (
            <div className="session-card">
              <div style={{ opacity: .85 }}>Your next session</div>
              <div className="big">{next.requested?.skill}{next.offered?.skill ? ` ⇄ ${next.offered.skill}` : ''}</div>
              <div>with {partner.name}</div>
              <div style={{ marginBottom: 14 }}>{when(next.session.scheduled_at, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
              <Link to={`/swaps/${next.id}`} className="btn btn-sm" style={{ background: '#fff', color: 'var(--rose-hover)' }}>Open swap</Link>
            </div>
          ) : (
            <div className="panel">
              <h3>No sessions booked</h3>
              <p className="muted" style={{ margin: 0 }}>Once you and a partner confirm a time, it’ll appear here with a calendar link.</p>
            </div>
          )}
          <div className="card">
            <div className="spread">
              <div><div className="stat">{user.balance}</div><div className="faint">credits available</div></div>
              <div style={{ color: 'var(--sage)' }}><SwapArrows size={34} /></div>
            </div>
            {user.escrowed_balance > 0 && <p className="faint" style={{ margin: '12px 0 0' }}>{user.escrowed_balance} more held for swaps in progress.</p>}
            <hr className="divider" />
            <div className="spread">
              <div><div className="stat" style={{ fontSize: '1.6rem' }}>{active}</div><div className="faint">active swaps</div></div>
              <div><div className="stat" style={{ fontSize: '1.6rem' }}>{done}</div><div className="faint">completed</div></div>
            </div>
          </div>
          <div className="panel">
            <p className="hand" style={{ margin: 0 }}>a little tip</p>
            <p className="muted" style={{ margin: '6px 0 0' }}>Profiles with a short bio and your free hours get twice as many replies. <Link to="/settings">Update yours</Link></p>
          </div>
        </aside>
      </div>
    </main>
  );
}
