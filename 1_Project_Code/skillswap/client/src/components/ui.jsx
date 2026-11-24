import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { levelLabel } from '../api';

export function Avatar({ name = '?', color = '#F4C9D6', size = 40 }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Verified() {
  return (
    <span className="badge-verified" title="Identity verified">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
      Verified
    </span>
  );
}

export function Stars({ value = 0, count }) {
  const full = Math.round(value);
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="stars" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= full ? '' : 'off'}>★</span>)}
      </span>
      {count !== undefined && <span className="faint">{count ? `${value} · ${count} review${count > 1 ? 's' : ''}` : 'New here'}</span>}
    </span>
  );
}

export function Person({ user, sub, size = 40, link = true }) {
  if (!user) return null;
  return (
    <div className="person">
      <Avatar name={user.name} color={user.avatar_color} size={size} />
      <div style={{ minWidth: 0 }}>
        {link ? <Link to={`/u/${user.id}`} className="person-name">{user.name}</Link> : <span className="person-name">{user.name}</span>}
        {user.trust_badge && <Verified />}
        {sub && <div className="faint">{sub}</div>}
      </div>
    </div>
  );
}

const STATUS_TEXT = {
  DRAFT: 'Draft', PROPOSED: 'Proposed', NEGOTIATING: 'Negotiating', ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed', CLOSED: 'Reviewed', DECLINED: 'Declined', CANCELLED: 'Cancelled',
};
export const Status = ({ s }) => <span className={`status st-${s}`}>{STATUS_TEXT[s] || s}</span>;

export const Chip = ({ type, children }) => (
  <span className={`chip ${type === 'OFFER' ? 'chip-teach' : type === 'WANT' ? 'chip-learn' : ''}`}>{children}</span>
);
export const Level = ({ level }) => <span className="chip chip-level">{levelLabel(level)}</span>;

export function SwapArrows({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
    </svg>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" fill="none"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export const ErrorBox = ({ error }) => (error ? <div className="alert alert-error" role="alert">{error}</div> : null);

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(window.__toastT);
    window.__toastT = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Loading() {
  return <p className="faint" style={{ padding: '40px 0' }}>Loading…</p>;
}
