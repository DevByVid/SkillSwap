import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Empty, Loading } from '../components/ui';
import SwapTicket, { needsMe, nextStep } from '../components/SwapTicket';

const TABS = [
  ['needs', 'Needs you', (s, me) => needsMe(s, me) && s.status !== 'DRAFT'],
  ['active', 'In progress', (s) => ['PROPOSED', 'NEGOTIATING', 'ACCEPTED', 'SCHEDULED'].includes(s.status)],
  ['done', 'Finished', (s) => ['COMPLETED', 'CLOSED', 'DECLINED', 'CANCELLED'].includes(s.status)],
  ['drafts', 'Drafts', (s) => s.status === 'DRAFT'],
];

export default function Swaps() {
  const { user } = useAuth();
  const [swaps, setSwaps] = useState(null);
  const [tab, setTab] = useState('needs');
  useEffect(() => { api('/swaps').then((d) => setSwaps(d.swaps)); }, []);

  if (!swaps) return <main className="wrap page"><Loading /></main>;
  const filter = TABS.find((t) => t[0] === tab)[2];
  const list = swaps.filter((s) => filter(s, user.id));

  return (
    <main className="wrap page">
      <div className="page-head spread">
        <div><h1>My swaps</h1><p>Every proposal you’ve sent or received, from first hello to final review.</p></div>
        <Link to="/explore" className="btn btn-primary">Find someone new</Link>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label, f]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}<span className="count">{swaps.filter((s) => f(s, user.id)).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty title={tab === 'needs' ? 'You’re all caught up' : 'Nothing here yet'} action={<Link to="/explore" className="btn btn-soft">Explore skills</Link>}>
          {tab === 'needs' ? 'When someone sends a proposal or a time to confirm, it lands here.' : 'Send a proposal from anyone’s profile to start a swap.'}
        </Empty>
      ) : (
        <div className="stack">
          {list.map((s) => (
            <div key={s.id}>
              <SwapTicket swap={s} me={user.id} />
              {nextStep(s, user.id) && <p className="faint" style={{ margin: '6px 4px 0' }}>{nextStep(s, user.id)}</p>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
