import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ago } from '../api';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, Status, useToast } from '../components/ui';

function Overview() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/admin/stats').then(setS); }, []);
  if (!s) return <Loading />;
  const maxDay = Math.max(1, ...s.daily.map((d) => d.n));
  const maxCat = Math.max(1, ...s.trending.map((t) => t.n));
  return (
    <div className="stack">
      <div className="kpis">
        <div className="card"><div className="stat">{s.users.active}</div><div className="faint">active members</div></div>
        <div className="card"><div className="stat">{s.users.new_30d}</div><div className="faint">joined in 30 days</div></div>
        <div className="card"><div className="stat">{s.swaps.total}</div><div className="faint">swaps proposed</div></div>
        <div className="card"><div className="stat">{s.swaps.completed}</div><div className="faint">swaps completed</div></div>
      </div>
      <div className="grid two">
        <section className="card">
          <h3>New swaps, last 14 days</h3>
          <div className="bars" role="img" aria-label="Swaps per day">
            {s.daily.map((d) => <div key={d.day} style={{ height: `${(d.n / maxDay) * 100}%` }} title={`${d.day}: ${d.n}`} />)}
          </div>
          <div className="spread faint" style={{ fontSize: '.78rem', marginTop: 6 }}><span>{s.daily[0]?.day}</span><span>{s.daily.at(-1)?.day}</span></div>
        </section>
        <section className="card">
          <h3>Trending categories</h3>
          {s.trending.length === 0 ? <p className="muted">No swaps yet.</p> : s.trending.map((t) => (
            <div key={t.category} style={{ marginBottom: 12 }}>
              <div className="spread" style={{ fontSize: '.92rem' }}><span>{t.category}</span><span className="faint">{t.n}</span></div>
              <div className="hbar"><span style={{ width: `${(t.n / maxCat) * 100}%` }} /></div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h3>Needs attention</h3>
        <div className="row" style={{ gap: 28 }}>
          <span><strong>{s.open.reports}</strong> open report{s.open.reports === 1 ? '' : 's'}</span>
          <span><strong>{s.open.disputes}</strong> open dispute{s.open.disputes === 1 ? '' : 's'}</span>
          <span><strong>{s.open.flagged_accounts}</strong> low-rated accounts</span>
          <span><strong>{s.open.flagged_messages}</strong> filtered messages</span>
        </div>
      </section>
      <section className="card">
        <h3>Swaps by status</h3>
        <div className="row">{s.byStatus.map((b) => <span key={b.status} className="row" style={{ gap: 6 }}><Status s={b.status} /> {b.n}</span>)}</div>
      </section>
    </div>
  );
}

function ActionModal({ target, onClose, onDone }) {
  const [type, setType] = useState('WARN');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api(`/admin/users/${target.id}/action`, { method: 'POST', body: { type, reason } }); onDone(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Moderate ${target.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <div className="segmented" role="group" style={{ marginBottom: 16 }}>
          {['WARN', 'SUSPEND', 'BAN', 'REINSTATE'].map((t) => (
            <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}>{t[0] + t.slice(1).toLowerCase()}</button>
          ))}
        </div>
        <Field label="Reason" hint="Warnings are sent to the member. Suspended and banned members can’t sign in.">
          <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${type === 'BAN' ? 'btn-danger' : 'btn-primary'}`}>Apply</button>
        </div>
      </form>
    </Modal>
  );
}

function People({ flaggedOnly }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState(null);
  const [target, setTarget] = useState(null);
  const toast = useToast();
  const load = useCallback(() => {
    api(flaggedOnly ? '/admin/flagged' : `/admin/users?q=${encodeURIComponent(q)}`).then((d) => setUsers(d.users));
  }, [q, flaggedOnly]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <>
      {flaggedOnly ? <p className="muted">Members averaging 2.5★ or less across two or more reviews.</p>
        : <input className="input" style={{ maxWidth: 360, marginBottom: 16 }} placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />}
      {!users ? <Loading /> : users.length === 0 ? <Empty title={flaggedOnly ? 'No low-rated accounts' : 'No members found'} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Member</th><th>Status</th><th>Rating</th>{!flaggedOnly && <th>Reports</th>}<th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="person"><Avatar name={u.name} color={u.avatar_color} size={32} /><div><Link to={`/u/${u.id}`} className="person-name">{u.name}</Link><div className="faint">{u.email}</div></div></div></td>
                  <td><span className={`status ${u.status === 'ACTIVE' ? 'st-COMPLETED' : u.status === 'WARNED' ? 'st-PROPOSED' : 'st-CANCELLED'}`}>{u.status[0] + u.status.slice(1).toLowerCase()}</span>{u.role === 'admin' && <span className="faint"> admin</span>}</td>
                  <td>{u.review_count ? `${u.rating}★ (${u.review_count})` : <span className="faint">None</span>}</td>
                  {!flaggedOnly && <td>{u.reports || <span className="faint">0</span>}</td>}
                  <td style={{ textAlign: 'right' }}>{u.role !== 'admin' && <button className="btn btn-ghost btn-sm" onClick={() => setTarget(u)}>Moderate</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && <ActionModal target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); toast('Action applied'); load(); }} />}
    </>
  );
}

function Reports() {
  const [d, setD] = useState(null);
  const load = () => api('/admin/reports').then(setD);
  useEffect(() => { load(); }, []);
  if (!d) return <Loading />;
  return (
    <div className="stack">
      {d.reports.length === 0 ? <Empty title="No reports" /> : d.reports.map((r) => (
        <article key={r.id} className="card">
          <div className="spread">
            <div><strong>{r.reporter}</strong> reported <Link to={`/u/${r.reported_user_id}`}>{r.reported}</Link> <span className="faint">{ago(r.created_at)}</span></div>
            {r.status === 'OPEN' ? <button className="btn btn-soft btn-sm" onClick={async () => { await api(`/admin/reports/${r.id}/close`, { method: 'POST' }); load(); }}>Mark reviewed</button>
              : <span className="faint">Reviewed</span>}
          </div>
          <p className="muted" style={{ margin: '10px 0 0' }}>{r.reason}</p>
        </article>
      ))}
      <h3 style={{ marginTop: 24 }}>Filtered messages</h3>
      {d.flaggedMessages.length === 0 ? <p className="muted">No messages have been filtered.</p> : (
        <div className="table-wrap"><table className="table"><tbody>
          {d.flaggedMessages.map((m) => (
            <tr key={m.id}><td><Link to={`/u/${m.sender_id}`}>{m.sender}</Link></td><td>{m.content}</td><td className="faint">swap #{m.swap_id}, {ago(m.sent_at)}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}

function ResolveModal({ d, onClose, onDone }) {
  const [outcome, setOutcome] = useState('refund');
  const [resolution, setResolution] = useState('');
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [error, setError] = useState('');
  const held = d.swap_status === 'SCHEDULED';
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/disputes/${d.id}/resolve`, { method: 'POST', body: { outcome, resolution, adjustUserId: adjustUserId ? Number(adjustUserId) : null, adjustAmount: Number(adjustAmount) } });
      onDone();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={`Resolve dispute on swap #${d.swap_id}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <p className="muted">{d.filed_by_name}: “{d.reason}”</p>
        {held && (
          <>
            <p><strong>{d.credits_offered}</strong> credit{d.credits_offered === 1 ? ' is' : 's are'} held. What should happen?</p>
            <div className="segmented" role="group" style={{ marginBottom: 16 }}>
              <button type="button" aria-pressed={outcome === 'refund'} onClick={() => setOutcome('refund')}>Refund {d.proposer.split(' ')[0]}, cancel swap</button>
              <button type="button" aria-pressed={outcome === 'release'} onClick={() => setOutcome('release')}>Pay {d.recipient.split(' ')[0]}, complete swap</button>
            </div>
          </>
        )}
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="Extra credit adjustment (optional)">
            <select className="input" value={adjustUserId} onChange={(e) => setAdjustUserId(e.target.value)}>
              <option value="">No adjustment</option>
              <option value={d.proposer_id}>{d.proposer}</option>
              <option value={d.recipient_id}>{d.recipient}</option>
            </select>
          </Field>
          <Field label="Amount" hint="Negative removes."><input className="input" type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} /></Field>
        </div>
        <Field label="Decision note" hint="Both members see this."><textarea className="input" required value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Resolve dispute</button>
        </div>
      </form>
    </Modal>
  );
}

function Disputes() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const toast = useToast();
  const load = () => api('/admin/disputes').then((d) => setList(d.disputes));
  useEffect(() => { load(); }, []);
  if (!list) return <Loading />;
  if (!list.length) return <Empty title="No disputes">When members open a dispute on a swap it appears here.</Empty>;
  return (
    <div className="stack">
      {list.map((d) => (
        <article key={d.id} className="card">
          <div className="spread">
            <div>
              <strong>{d.skill || 'Swap'}</strong> between {d.proposer} and {d.recipient} <span className="faint">swap #{d.swap_id}, {ago(d.created_at)}</span>
            </div>
            {d.status === 'OPEN' ? <button className="btn btn-primary btn-sm" onClick={() => setOpen(d)}>Resolve</button> : <span className="status st-COMPLETED">Resolved</span>}
          </div>
          <p className="muted" style={{ margin: '10px 0 0' }}><strong>{d.filed_by_name}:</strong> {d.reason}</p>
          {d.resolution && <p style={{ margin: '8px 0 0' }}>Decision: {d.resolution}</p>}
        </article>
      ))}
      {open && <ResolveModal d={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); toast('Dispute resolved'); load(); }} />}
    </div>
  );
}

const TABS = [['overview', 'Overview'], ['people', 'Members'], ['flagged', 'Low ratings'], ['reports', 'Reports'], ['disputes', 'Disputes']];

export default function Admin() {
  const [tab, setTab] = useState('overview');
  return (
    <main className="wrap page">
      <div className="page-head"><h1>Admin</h1><p>Keep the community healthy: watch activity, review reports and settle disputes fairly.</p></div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'people' && <People />}
      {tab === 'flagged' && <People flaggedOnly />}
      {tab === 'reports' && <Reports />}
      {tab === 'disputes' && <Disputes />}
    </main>
  );
}
