import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ago } from '../api';
import { useAuth } from '../auth';
import { Avatar, Empty, Loading, Status } from '../components/ui';
import Chat from '../components/Chat';

export default function Messages() {
  const { id } = useParams();
  const { user } = useAuth();
  const [swaps, setSwaps] = useState(null);
  useEffect(() => { api('/swaps').then((d) => setSwaps(d.swaps.filter((s) => s.status !== 'DRAFT'))); }, []);

  if (!swaps) return <main className="wrap page"><Loading /></main>;
  const current = swaps.find((s) => String(s.id) === id) || (!id ? swaps[0] : null);
  const partnerOf = (s) => (s.proposer.id === user.id ? s.recipient : s.proposer);

  return (
    <main className="wrap page">
      <div className="page-head"><h1>Messages</h1><p>Each conversation belongs to a swap, so details never get lost.</p></div>
      {swaps.length === 0 ? (
        <Empty title="No conversations yet" action={<Link to="/explore" className="btn btn-primary">Explore skills</Link>}>
          Once you send or receive a proposal, you can chat about it here.
        </Empty>
      ) : (
        <div className="convo-layout">
          <nav className="convo-list" aria-label="Conversations">
            {swaps.map((s) => {
              const p = partnerOf(s);
              return (
                <Link key={s.id} to={`/messages/${s.id}`} className={current?.id === s.id ? 'active' : ''}>
                  <Avatar name={p.name} color={p.avatar_color} size={40} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="spread" style={{ gap: 6 }}><strong>{p.name}</strong><span className="faint" style={{ fontSize: '.78rem' }}>{ago(s.updated_at)}</span></div>
                    <div className="faint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.requested?.skill}{s.offered?.skill ? ` ⇄ ${s.offered.skill}` : ''}
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>
          {current ? (
            <div className="stack">
              <div className="spread">
                <Link to={`/swaps/${current.id}`}>Open swap details</Link>
                <Status s={current.status} />
              </div>
              <Chat swapId={current.id} partner={partnerOf(current)} me={user.id} height={560} />
            </div>
          ) : <Empty title="Pick a conversation" />}
        </div>
      )}
    </main>
  );
}
