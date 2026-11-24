import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Empty, Loading } from '../components/ui';
import { ListingCard } from '../components/Propose';

// Search & filter (REQ-6, REQ-8). Guests can browse too.
export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');

  const get = (k, d = '') => params.get(k) || d;
  const update = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  useEffect(() => { api('/skills').then((d) => setCategories(d.categories)); }, []);
  useEffect(() => {
    setResults(null);
    const t = setTimeout(() => api(`/search?${params.toString()}`).then((d) => setResults(d.results)).catch(() => setResults([])), 150);
    return () => clearTimeout(t);
  }, [params]);

  const type = get('type', 'OFFER');

  return (
    <main className="wrap page">
      <div className="page-head">
        <h1>Explore skills</h1>
        <p>Find someone to learn from, or someone who’d love to learn what you know.</p>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="segmented" role="group" aria-label="Show">
          <button aria-pressed={type === 'OFFER'} onClick={() => update('type', '')}>People teaching</button>
          <button aria-pressed={type === 'WANT'} onClick={() => update('type', 'WANT')}>People learning</button>
        </div>
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); update('q', q.trim()); }}>
        <input className="input" type="search" placeholder="Try “guitar”, “Excel” or “French”" value={q}
          onChange={(e) => setQ(e.target.value)} onBlur={() => update('q', q.trim())} aria-label="Search skills" />
        <select className="input" value={get('category')} onChange={(e) => update('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input" placeholder="City" defaultValue={get('location')} onBlur={(e) => update('location', e.target.value.trim())} aria-label="City" />
        <button className="btn btn-primary">Search</button>
      </form>

      <div className="row" style={{ marginBottom: 24 }}>
        <select className="input" style={{ width: 'auto' }} value={get('minRating')} onChange={(e) => update('minRating', e.target.value)} aria-label="Minimum rating">
          <option value="">Any rating</option>
          <option value="4">4★ and up</option>
          <option value="4.5">4.5★ and up</option>
        </select>
        <select className="input" style={{ width: 'auto' }} value={get('sort')} onChange={(e) => update('sort', e.target.value)} aria-label="Sort">
          <option value="">Best match</option>
          <option value="rating">Highest rated</option>
          <option value="newest">Newest</option>
        </select>
        <label className="check" style={{ padding: 0 }}>
          <input type="checkbox" checked={get('verified') === 'true'} onChange={(e) => update('verified', e.target.checked ? 'true' : '')} />
          <span>Verified people only</span>
        </label>
        <input className="input" style={{ width: 200 }} placeholder="Free when? e.g. weekends" defaultValue={get('availability')}
          onBlur={(e) => update('availability', e.target.value.trim())} aria-label="Availability" />
      </div>

      {results === null ? <Loading /> : results.length === 0 ? (
        <Empty title="No one matches that yet" action={<button className="btn btn-soft" onClick={() => { setQ(''); setParams({}); }}>Clear filters</button>}>
          Try a broader word, another city, or fewer filters.
        </Empty>
      ) : (
        <>
          <p className="faint">{results.length} {results.length === 1 ? 'person' : 'people'}</p>
          <div className="grid g3">{results.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        </>
      )}
    </main>
  );
}
