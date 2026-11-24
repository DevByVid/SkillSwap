import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, ago } from '../api';
import { Avatar, SwapArrows } from './ui';

export function Brand() {
  return (
    <Link to="/" className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#B8406A" />
        <path d="M9 13h12l-3-3M23 19H11l3 3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      SkillSwap
    </Link>
  );
}

function useOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef();
  const nav = useNavigate();
  useOutside(ref, () => setOpen(false));

  const load = () => api('/notifications').then((d) => { setItems(d.notifications); setUnread(d.unread); }).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // light polling keeps the bell fresh
    return () => clearInterval(t);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.is_read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    load();
    if (n.link) nav(n.link);
  };
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); load(); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)}>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" /></svg>
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="menu notif-menu">
          <header>
            <strong>Notifications</strong>
            {unread > 0 && <button className="btn-link" onClick={readAll}>Mark all as read</button>}
          </header>
          {items.length === 0 && <p className="faint" style={{ padding: 16, margin: 0 }}>Nothing yet. We’ll let you know when someone reaches out.</p>}
          {items.map((n) => (
            <a key={n.id} href={n.link || '#'} className={`notif ${n.is_read ? 'read' : 'unread'}`} onClick={(e) => { e.preventDefault(); openItem(n); }}>
              <span className="pip" />
              <span>{n.content}<br /><span className="faint">{ago(n.sent_at)}</span></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" style={{ width: 44, height: 44 }} onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar name={user.name} color={user.avatar_color} size={36} />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          <div style={{ padding: '10px 12px' }}><strong>{user.name}</strong><div className="faint">{user.email}</div></div>
          <Link to={`/u/${user.id}`}>View my profile</Link>
          <Link to="/settings">Settings</Link>
          <Link to="/credits">Credit history</Link>
          {user.role === 'admin' && <Link to="/admin">Admin dashboard</Link>}
          <button onClick={logout}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Brand />
        {user && (
          <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Main">
            <NavLink to="/home">Home</NavLink>
            <NavLink to="/explore">Explore</NavLink>
            <NavLink to="/swaps">My swaps</NavLink>
            <NavLink to="/messages">Messages</NavLink>
            <NavLink to="/my-skills">My skills</NavLink>
            {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>
        )}
        <div className="nav-right">
          {user ? (
            <>
              <Link to="/credits" className="credit-chip" title="Your credits">
                <SwapArrows size={16} /> {user.balance ?? 0} <span>credits</span>
              </Link>
              <Notifications />
              <UserMenu user={user} logout={() => { logout(); nav('/'); }} />
              <button className="icon-btn burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              </button>
            </>
          ) : (
            <>
              <Link to="/explore" className="btn btn-ghost btn-sm hide-sm">Browse skills</Link>
              <Link to="/login" className="btn btn-soft btn-sm">Sign in</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Join free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
