import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, when } from '../api';
import { Loading } from '../components/ui';

const TYPE = {
  STARTER: 'Welcome credits', ESCROW_HOLD: 'Held for a swap', ESCROW_RELEASE: 'Released after a swap',
  ESCROW_REFUND: 'Returned to you', ADJUSTMENT: 'Adjusted by an admin',
};

// REQ-19: auditable credit history
export default function Credits() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/credits').then(setData); }, []);
  if (!data) return <main className="wrap page"><Loading /></main>;
  const { account, transactions } = data;

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1>Credits</h1>
        <p>Credits even out swaps that aren’t quite equal. You add them to a proposal, we hold them, and they go to your partner once you both mark the swap complete.</p>
      </div>
      <div className="grid g3" style={{ marginBottom: 32 }}>
        <div className="card"><div className="stat" style={{ color: 'var(--sage)' }}>{account.balance}</div><div className="faint">available to use</div></div>
        <div className="card"><div className="stat">{account.escrowed_balance}</div><div className="faint">held in swaps in progress</div></div>
        <div className="panel"><p className="hand" style={{ margin: 0 }}>earn more</p><p className="muted" style={{ margin: '4px 0 0' }}>Teach someone who adds credits to their proposal. <Link to="/my-skills">Add a skill you teach</Link></p></div>
      </div>
      <h2>History</h2>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>What happened</th><th>Swap</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="faint">{when(t.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td>{TYPE[t.type]}<div className="faint">{t.note}</div></td>
                <td>{t.swap_id ? <Link to={`/swaps/${t.swap_id}`}>#{t.swap_id}</Link> : <span className="faint">None</span>}</td>
                <td style={{ textAlign: 'right' }} className={t.amount > 0 ? 'amount-pos' : t.amount < 0 ? 'amount-neg' : 'faint'}>
                  {t.amount > 0 ? `+${t.amount}` : t.amount === 0 ? '0' : t.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
