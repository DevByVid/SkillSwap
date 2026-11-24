import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, ErrorBox, Field, Verified, useToast } from '../components/ui';

const COLORS = ['#F4C9D6', '#F7D6C4', '#E6D3F2', '#CFE6D8', '#FBE3A8', '#D6E4F5'];

export default function Settings() {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [p, setP] = useState({ name: user.name, bio: user.bio || '', location: user.location || '', availability: user.availability || '', avatarColor: user.avatar_color });
  const [error, setError] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setError('');
    try { await api('/users/me', { method: 'PUT', body: p }); await refresh(); toast('Profile saved'); }
    catch (err) { setError(err.message); }
  };
  const pref = async (k, v) => { await api('/users/me/notifications', { method: 'PUT', body: { [k]: v } }); await refresh(); toast('Preferences saved'); };
  const verifyIdentity = async () => {
    setError('');
    try { await api('/users/me/verify-identity', { method: 'POST', body: { method: 'ID_DOCUMENT' } }); await refresh(); toast('You’re verified'); }
    catch (err) { setError(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };
  const resend = async () => { const r = await api('/auth/resend-verification', { method: 'POST' }); setVerifyUrl(r.devVerifyUrl); };
  const del = async () => {
    if (!confirm('Delete your account? Your profile and personal details are erased. This can’t be undone.')) return;
    try { await api('/users/me', { method: 'DELETE' }); logout(); nav('/'); }
    catch (err) { setError(err.message); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  };

  return (
    <main className="wrap page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>Settings</h1><p>How you appear to others, and how we reach you.</p></div>
      <ErrorBox error={error} />

      <form className="card" onSubmit={save} style={{ marginBottom: 24 }}>
        <h2>Your profile</h2>
        <div className="row" style={{ marginBottom: 20 }}>
          <Avatar name={p.name} color={p.avatarColor} size={64} />
          <div className="row" style={{ gap: 8 }} role="radiogroup" aria-label="Avatar colour">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={p.avatarColor === c} aria-label={`Colour ${c}`} onClick={() => setP({ ...p, avatarColor: c })}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: p.avatarColor === c ? '2.5px solid var(--rose)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--petal)' }} />
            ))}
          </div>
        </div>
        <Field label="Name"><input className="input" value={p.name} onChange={set('name')} required /></Field>
        <Field label="About you" hint="What do you do, what do you love, how do you like to teach?"><textarea className="input" value={p.bio} onChange={set('bio')} maxLength={500} /></Field>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="City"><input className="input" value={p.location} onChange={set('location')} /></Field>
          <Field label="When are you free?" hint="e.g. Weekday evenings, Sundays"><input className="input" value={p.availability} onChange={set('availability')} /></Field>
        </div>
        <button className="btn btn-primary">Save profile</button>
      </form>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Trust and verification</h2>
        <div className="spread">
          <div><strong>Email</strong><div className="faint">{user.email}</div></div>
          {user.email_verified ? <span className="badge-verified">Verified</span> : <button className="btn btn-soft btn-sm" onClick={resend}>Send verification link</button>}
        </div>
        {verifyUrl && <div className="alert alert-info" style={{ marginTop: 12 }}>No email service in this local build: <a href={verifyUrl.replace(/^https?:\/\/[^/]+/, '')}>verify now</a></div>}
        <hr className="divider" />
        <div className="spread">
          <div>
            <strong>Identity badge</strong>{user.trust_badge && <Verified />}
            <div className="faint" style={{ maxWidth: '46ch' }}>{user.trust_badge ? 'Your badge shows on your profile and listings.' : 'Verified people get more replies. Needs a verified email, a bio and your city.'}</div>
          </div>
          {!user.trust_badge && <button className="btn btn-soft btn-sm" onClick={verifyIdentity}>Verify my identity</button>}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Notifications</h2>
        <p className="muted">We’ll tell you about new proposals, messages, matches and session reminders.</p>
        <label className="check"><input type="checkbox" checked={user.notify_inapp} onChange={(e) => pref('inapp', e.target.checked)} /><span>In the app</span></label>
        <label className="check"><input type="checkbox" checked={user.notify_email} onChange={(e) => pref('email', e.target.checked)} /><span>By email</span></label>
        <label className="check"><input type="checkbox" checked={user.notify_sms} onChange={(e) => pref('sms', e.target.checked)} /><span>By SMS</span></label>
      </section>

      <section className="card">
        <h2>Delete account</h2>
        <p className="muted">We’ll erase your profile and personal details. Swap and credit records stay, anonymised, so past partners’ histories still add up.</p>
        <button className="btn btn-danger" onClick={del}>Delete my account</button>
      </section>
    </main>
  );
}
