import { useEffect, useState } from 'react';
import { api, LEVELS, levelLabel } from '../api';
import { Chip, Empty, ErrorBox, Field, Level, Loading, Modal, useToast } from '../components/ui';

function ListingForm({ initial, skills, onSaved, onClose, setSkills }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({ skillId: initial?.skill_id || '', type: initial?.type || 'OFFER', level: initial?.level || 'BEGINNER', description: initial?.description || '' });
  const [newSkill, setNewSkill] = useState({ name: '', category: '' });
  const [error, setError] = useState('');
  const toast = useToast();
  const cats = [...new Set(skills.map((s) => s.category))];

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      let skillId = form.skillId;
      if (skillId === 'new') {
        const { skill } = await api('/skills', { method: 'POST', body: newSkill });
        setSkills((s) => [...s.filter((x) => x.id !== skill.id), skill]);
        skillId = skill.id;
      }
      if (editing) await api(`/listings/${initial.id}`, { method: 'PUT', body: { level: form.level, description: form.description } });
      else await api('/listings', { method: 'POST', body: { ...form, skillId: Number(skillId) } });
      toast(editing ? 'Skill updated' : 'Skill added');
      onSaved();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title={editing ? `Edit ${initial.skill}` : 'Add a skill'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />
        {!editing && (
          <>
            <div className="segmented" role="group" aria-label="Type" style={{ marginBottom: 16 }}>
              <button type="button" aria-pressed={form.type === 'OFFER'} onClick={() => setForm({ ...form, type: 'OFFER' })}>I can teach this</button>
              <button type="button" aria-pressed={form.type === 'WANT'} onClick={() => setForm({ ...form, type: 'WANT' })}>I want to learn this</button>
            </div>
            <Field label="Skill">
              <select className="input" required value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })}>
                <option value="">Choose a skill</option>
                {cats.map((c) => (
                  <optgroup key={c} label={c}>
                    {skills.filter((s) => s.category === c).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
                <option value="new">Something else…</option>
              </select>
            </Field>
            {form.skillId === 'new' && (
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Skill name"><input className="input" required value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} /></Field>
                <Field label="Category"><input className="input" required list="cats" value={newSkill.category} onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })} /></Field>
                <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
            )}
          </>
        )}
        <Field label={form.type === 'OFFER' ? 'How good are you?' : 'Where are you now?'}>
          <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
            {LEVELS.map((l) => <option key={l} value={l}>{levelLabel(l)}</option>)}
          </select>
        </Field>
        <Field label={form.type === 'OFFER' ? 'What will you cover?' : 'What would you like to learn?'} hint="Optional, but a sentence helps people say yes.">
          <textarea className="input" value={form.description} maxLength={400} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">{editing ? 'Save changes' : 'Add skill'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MySkills() {
  const [listings, setListings] = useState(null);
  const [skills, setSkills] = useState([]);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const load = () => api('/listings/mine').then((d) => setListings(d.listings));
  useEffect(() => { load(); api('/skills').then((d) => setSkills(d.skills)); }, []);

  const remove = async (l) => {
    if (!confirm(`Remove ${l.skill} from your list?`)) return;
    await api(`/listings/${l.id}`, { method: 'DELETE' });
    toast('Skill removed'); load();
  };

  if (!listings) return <main className="wrap page"><Loading /></main>;
  const col = (type, title, hint) => {
    const items = listings.filter((l) => l.type === type);
    return (
      <section>
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-soft btn-sm" onClick={() => setEditing({ type })}>Add</button>
        </div>
        {items.length === 0 ? <Empty title="Nothing here yet">{hint}</Empty> : (
          <div className="stack">
            {items.map((l) => (
              <article key={l.id} className="card">
                <div className="spread">
                  <div>
                    <h3 style={{ marginBottom: 4 }}>{l.skill}</h3>
                    <div className="row" style={{ gap: 6 }}><Chip>{l.category}</Chip><Level level={l.level} /></div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(l)}>Remove</button>
                  </div>
                </div>
                {l.description && <p className="muted" style={{ margin: '12px 0 0' }}>{l.description}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1>My skills</h1>
        <p>What you list here decides who we suggest to you, and who finds you in search.</p>
      </div>
      <div className="grid g2" style={{ gap: 32 }}>
        {col('OFFER', 'I can teach', 'Everyone is good at something. Cooking, Excel, a language, a sport?')}
        {col('WANT', 'I want to learn', 'Add a few things you’re curious about and we’ll find people who teach them.')}
      </div>
      {editing && (
        <ListingForm initial={editing.id ? editing : { type: editing.type }} skills={skills} setSkills={setSkills}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </main>
  );
}
