import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Field } from '../components/ui';

function AuthShell({ quote, by, children }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <p className="hand">from the community</p>
        <blockquote>{quote}</blockquote>
        <span className="muted">{by}</span>
      </aside>
      <div className="auth-form">{children}</div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await login(form.email, form.password); nav(loc.state?.from || '/home'); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <AuthShell quote="I taught a stranger to bake bread and she built my bakery’s website. We still message every week." by="Meera, Bhopal">
      <form onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to see your swaps and messages.</p>
        <ErrorBox error={error} />
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password"><input className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <div className="spread" style={{ marginBottom: 20 }}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted" style={{ marginTop: 20, textAlign: 'center' }}>New here? <Link to="/register">Create an account</Link></p>
        <div className="alert alert-info" style={{ marginTop: 24, fontSize: '.88rem' }}>
          Demo accounts use the password <strong>password123</strong>: aisha@example.com, rohan@example.com, sneha@example.com, or admin@skillswap.local for the admin view.
        </div>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', dateOfBirth: '', location: '' });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await register(form);
      nav('/welcome', { state: { verifyUrl: res.devVerifyUrl } });
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <AuthShell quote="Rohan taught me five chords in a month. I helped him automate the spreadsheet he’d been dreading." by="Aisha, Indore">
      <form onSubmit={submit}>
        <h1>Join SkillSwap</h1>
        <p className="muted">It’s free. You’ll get 5 credits to start.</p>
        <ErrorBox error={error} />
        <Field label="Your name"><input className="input" required autoComplete="name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 8 characters."><input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} /></Field>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Date of birth" hint="You must be 16+."><input className="input" type="date" required value={form.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
          <Field label="City"><input className="input" placeholder="e.g. Indore" value={form.location} onChange={set('location')} /></Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="muted">I’ll be kind, show up on time, and meet in public places for in-person swaps.</span>
        </label>
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={busy || !agree}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="muted" style={{ marginTop: 20, textAlign: 'center' }}>Already a member? <Link to="/login">Sign in</Link></p>
        <p className="faint" style={{ textAlign: 'center' }}>Google and Facebook sign-in need OAuth keys and aren’t set up in this local build.</p>
      </form>
    </AuthShell>
  );
}

export function Welcome() {
  const loc = useLocation();
  const { user } = useAuth();
  const url = loc.state?.verifyUrl;
  return (
    <main className="wrap page" style={{ maxWidth: 620 }}>
      <p className="hand">you’re in!</p>
      <h1>Welcome, {user?.name?.split(' ')[0]}</h1>
      <p className="muted">We’ve sent a verification link to <strong>{user?.email}</strong>. Verifying unlocks the trust badge.</p>
      {url && (
        <div className="alert alert-info">
          No email service is connected in this local build, so here’s your link: <a href={url.replace(/^https?:\/\/[^/]+/, '')}>Verify my email</a>
        </div>
      )}
      <h2 style={{ marginTop: 32 }}>Next, tell people what you can share</h2>
      <p className="muted">Add one skill you can teach and one you’d like to learn. That’s all we need to suggest matches.</p>
      <div className="row"><Link to="/my-skills" className="btn btn-primary">Add my skills</Link><Link to="/home" className="btn btn-ghost">Go to home</Link></div>
    </main>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    api('/auth/verify-email', { method: 'POST', body: { token: params.get('token') } })
      .then(() => { setState('ok'); refresh(); })
      .catch((e) => { setError(e.message); setState('err'); });
  }, [params, refresh]);
  return (
    <main className="wrap page" style={{ maxWidth: 560 }}>
      {state === 'loading' && <p className="faint">Checking your link…</p>}
      {state === 'ok' && <><h1>Email verified</h1><p className="muted">Thanks! You can now get your trust badge from Settings.</p><Link className="btn btn-primary" to="/home">Go to home</Link></>}
      {state === 'err' && <><h1>That link didn’t work</h1><ErrorBox error={error} /><Link className="btn btn-soft" to="/settings">Send a new link from Settings</Link></>}
    </main>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    const res = await api('/auth/forgot-password', { method: 'POST', body: { email } });
    setSent(res);
  };
  return (
    <main className="wrap page" style={{ maxWidth: 460 }}>
      <h1>Reset your password</h1>
      {sent ? (
        <>
          <div className="alert alert-ok">If an account exists for {email}, we’ve sent a reset link. It works for 30 minutes.</div>
          {sent.devResetUrl && <div className="alert alert-info">No email service in this local build: <a href={sent.devResetUrl.replace(/^https?:\/\/[^/]+/, '')}>open the reset link</a></div>}
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="muted">Enter your email and we’ll send you a link to choose a new password.</p>
          <Field label="Email"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn btn-primary">Send reset link</button>
        </form>
      )}
    </main>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password } }); nav('/login'); }
    catch (err) { setError(err.message); }
  };
  return (
    <main className="wrap page" style={{ maxWidth: 460 }}>
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="New password" hint="At least 8 characters."><input className="input" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="btn btn-primary">Save password</button>
      </form>
    </main>
  );
}
