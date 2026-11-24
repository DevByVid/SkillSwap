import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, when } from '../api';
import { Avatar } from './ui';

// In-app messages tied to a swap (REQ-14). Polls every 4s; filtering happens on the server (REQ-17).
export default function Chat({ swapId, partner, me, disabled, height }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const body = useRef();
  const lastId = useRef(0);

  useEffect(() => {
    setMsgs([]); lastId.current = 0;
    let alive = true;
    const load = async () => {
      try {
        const d = await api(`/swaps/${swapId}/messages?after=${lastId.current}`);
        if (alive && d.messages.length) {
          lastId.current = d.messages[d.messages.length - 1].id;
          setMsgs((m) => [...m, ...d.messages]);
        }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [swapId]);

  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [msgs]);

  const send = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText(''); setNote('');
    try {
      const d = await api(`/swaps/${swapId}/messages`, { method: 'POST', body: { content } });
      if (d.filtered) setNote('Part of your message was hidden. Links and rude words are filtered to keep everyone safe.');
      lastId.current = Math.max(lastId.current, d.message.id);
      setMsgs((m) => [...m, d.message]);
    } catch (err) { setNote(err.message); setText(content); }
  };

  return (
    <section className="chat" style={height ? { height } : null} aria-label={`Messages with ${partner.name}`}>
      <div className="chat-head person">
        <Avatar name={partner.name} color={partner.avatar_color} size={34} />
        <div><Link to={`/u/${partner.id}`} className="person-name">{partner.name}</Link><div className="faint">Messages stay on this swap</div></div>
      </div>
      <div className="chat-body" ref={body}>
        {msgs.length === 0 && <p className="faint" style={{ textAlign: 'center', margin: 'auto' }}>Say hello and sort out the details here.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === me ? 'mine' : 'theirs'}`}>
            {m.content}
            {m.is_flagged && <span className="flag">Filtered for safety</span>}
            <time dateTime={m.sent_at}>{when(m.sent_at, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</time>
          </div>
        ))}
      </div>
      {note && <div className="alert alert-info" style={{ margin: '0 12px', fontSize: '.85rem' }}>{note}</div>}
      <form className="chat-form" onSubmit={send}>
        <input className="input" placeholder={disabled ? 'This conversation is closed' : 'Write a message'} value={text}
          onChange={(e) => setText(e.target.value)} disabled={disabled} aria-label="Message" maxLength={2000} />
        <button className="btn btn-primary" disabled={disabled || !text.trim()}>Send</button>
      </form>
    </section>
  );
}
