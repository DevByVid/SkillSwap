import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, Chip, Level, SwapArrows } from '../components/ui';
import { ListingCard } from '../components/Propose';

export default function Landing() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  useEffect(() => { api('/search?sort=rating').then((d) => { const seen = new Set(); setListings(d.results.filter((l) => !seen.has(l.user_id) && seen.add(l.user_id)).slice(0, 6)); }).catch(() => {}); }, []);
  if (user) return <Navigate to="/home" replace />;

  return (
    <>
      <main className="wrap">
        <section className="hero">
          <div>
            <p className="hand" style={{ marginBottom: 10 }}>no money, just people</p>
            <h1>Teach what you know. Learn what you don’t.</h1>
            <p className="lede">
              SkillSwap pairs you with people nearby who want what you’re good at, and are good at what you want.
              An hour of Python for an hour of guitar. A sourdough lesson for a portfolio website.
            </p>
            <div className="row">
              <Link to="/register" className="btn btn-primary">Create your free account</Link>
              <Link to="/explore" className="btn btn-ghost">Browse skills first</Link>
            </div>
            <p className="faint" style={{ marginTop: 18 }}>Everyone starts with 5 credits to balance uneven swaps.</p>
          </div>

          <div className="hero-stage" aria-label="Example: Aisha teaches Python, Rohan teaches guitar">
            <div className="trade-card a">
              <div className="row" style={{ gap: 10 }}>
                <Avatar name="Aisha Sharma" color="#F4C9D6" size={38} />
                <div><strong>Aisha</strong><div className="faint">CS student, Indore</div></div>
              </div>
              <div className="skill">Python Programming</div>
              <div className="row" style={{ gap: 6 }}><Chip type="OFFER">Can teach</Chip><Level level="ADVANCED" /></div>
            </div>
            <span className="hand note-a">“patient with<br />total beginners”</span>
            <div className="swap-orbit"><SwapArrows size={30} /></div>
            <span className="hand note-b">Sunday, 5 pm<br />on Google Meet</span>
            <div className="trade-card b">
              <div className="row" style={{ gap: 10 }}>
                <Avatar name="Rohan Verma" color="#E6D3F2" size={38} />
                <div><strong>Rohan</strong><div className="faint">Accountant, Indore</div></div>
              </div>
              <div className="skill">Acoustic Guitar</div>
              <div className="row" style={{ gap: 6 }}><Chip type="OFFER">Can teach</Chip><Level level="EXPERT" /></div>
            </div>
          </div>
        </section>

        <section className="band">
          <h2 style={{ marginBottom: 28 }}>How a swap works</h2>
          <ol className="steps steps-wrap">
            <li><h3>List your skills</h3><p>Add what you can teach and what you’d like to learn. Cooking, code, chess, anything.</p></li>
            <li><h3>Find your match</h3><p>We suggest people whose skills fit yours, close by and free when you are.</p></li>
            <li><h3>Swap and review</h3><p>Agree on a time, meet up or call, then rate each other so the community stays kind.</p></li>
          </ol>
        </section>

        {listings.length > 0 && (
          <section style={{ marginBottom: 64 }}>
            <div className="section-title">
              <h2>People teaching right now</h2>
              <Link to="/explore">See all skills</Link>
            </div>
            <div className="grid g3">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </section>
        )}

        <section className="grid two" style={{ marginBottom: 64 }}>
          <div className="card">
            <h3>Fair, with credits</h3>
            <p className="muted" style={{ margin: 0 }}>When one lesson is longer than the other, add credits. They’re held safely until you both say the swap went well.</p>
          </div>
          <div className="card">
            <h3>Safe, with real reviews</h3>
            <p className="muted" style={{ margin: 0 }}>Verified badges, ratings after every swap, message filtering and a report button on every profile. For in-person swaps, always meet somewhere public.</p>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="wrap spread">
          <span>SkillSwap, a community skill exchange. You must be 16 or older to join.</span>
          <span>Made by Vidushi Singh, Vikalp Tiwari and Vikalp Singh</span>
        </div>
      </footer>
    </>
  );
}
