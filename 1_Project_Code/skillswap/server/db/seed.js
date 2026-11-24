// Seeds demo data, including the "Python for Guitar" swap from the object diagram (Experiment 5).
// Every demo account uses the password: password123
const bcrypt = require('bcryptjs');
const { end, tx } = require('../src/db');
const credits = require('../src/lib/credits');

const SKILLS = [
  ['Python Programming', 'Technology'], ['Web Development', 'Technology'], ['Excel & Spreadsheets', 'Technology'],
  ['Data Analysis', 'Technology'], ['Video Editing', 'Creative'], ['Photography', 'Creative'],
  ['Graphic Design', 'Creative'], ['Watercolour Painting', 'Creative'], ['Acoustic Guitar', 'Music'],
  ['Piano', 'Music'], ['Hindustani Vocals', 'Music'], ['Tabla', 'Music'], ['Spoken English', 'Languages'],
  ['French', 'Languages'], ['Japanese', 'Languages'], ['Sanskrit', 'Languages'], ['Yoga', 'Health & Fitness'],
  ['Strength Training', 'Health & Fitness'], ['Indian Home Cooking', 'Cooking'], ['Baking', 'Cooking'],
  ['Public Speaking', 'Career'], ['Resume Writing', 'Career'], ['Chess', 'Hobbies'], ['Knitting', 'Hobbies'],
  ['Calculus', 'Academics'], ['Physics', 'Academics'],
];

const USERS = [
  { name: 'Admin', email: 'admin@skillswap.local', role: 'admin', loc: 'Indore', bio: 'Keeping SkillSwap kind and fair.' },
  { name: 'Aisha Sharma', email: 'aisha@example.com', loc: 'Indore', avail: 'Weekday evenings, Sunday mornings',
    bio: 'Final-year CS student. I love explaining code with doodles. Trying to finally learn the guitar my dad gave me.',
    offers: [['Python Programming', 'ADVANCED', 'From print() to small projects. Patient with total beginners.'], ['Calculus', 'INTERMEDIATE', 'JEE-level, with lots of practice problems.']],
    wants: [['Acoustic Guitar', 'BEGINNER'], ['Photography', 'BEGINNER']] },
  { name: 'Rohan Verma', email: 'rohan@example.com', loc: 'Indore', avail: 'Weekday evenings, Saturdays', badge: true,
    bio: 'Guitar teacher on weekends, accountant on weekdays. Want to automate my spreadsheets with Python.',
    offers: [['Acoustic Guitar', 'EXPERT', 'Chords, strumming patterns and your first Bollywood song in a month.'], ['Excel & Spreadsheets', 'ADVANCED', 'Pivot tables, lookups and clean dashboards.']],
    wants: [['Python Programming', 'BEGINNER'], ['Public Speaking', 'INTERMEDIATE']] },
  { name: 'Meera Iyer', email: 'meera@example.com', loc: 'Bhopal', avail: 'Weekends', badge: true,
    bio: 'Home baker and weekend watercolourist. My kitchen smells like cardamom most days.',
    offers: [['Baking', 'EXPERT', 'Breads, cakes and eggless everything.'], ['Watercolour Painting', 'INTERMEDIATE', 'Loose florals and landscapes.']],
    wants: [['Web Development', 'BEGINNER'], ['Photography', 'INTERMEDIATE']] },
  { name: 'Kabir Khan', email: 'kabir@example.com', loc: 'Indore', avail: 'Mornings, Sundays',
    bio: 'Wedding photographer. Learning to code so I can build my own portfolio site.',
    offers: [['Photography', 'EXPERT', 'Manual mode, natural light and editing in Lightroom.'], ['Video Editing', 'ADVANCED', 'Premiere Pro and DaVinci basics.']],
    wants: [['Web Development', 'BEGINNER'], ['Python Programming', 'BEGINNER']] },
  { name: 'Priya Nair', email: 'priya@example.com', loc: 'Pune', avail: 'Weekday evenings', badge: true,
    bio: 'Frontend developer by day, Carnatic-trained singer forever. Happy to talk React all night.',
    offers: [['Web Development', 'EXPERT', 'HTML, CSS, JavaScript and React.'], ['Hindustani Vocals', 'INTERMEDIATE', 'Basic ragas and breathing.']],
    wants: [['Baking', 'BEGINNER'], ['French', 'BEGINNER']] },
  { name: 'Arjun Mehta', email: 'arjun@example.com', loc: 'Indore', avail: 'Evenings, Saturdays',
    bio: 'District-level chess player. Want to speak more confidently in interviews.',
    offers: [['Chess', 'EXPERT', 'Openings, tactics and endgames.'], ['Physics', 'ADVANCED', 'Class 11–12 mechanics.']],
    wants: [['Public Speaking', 'BEGINNER'], ['Spoken English', 'INTERMEDIATE']] },
  { name: 'Sneha Patel', email: 'sneha@example.com', loc: 'Indore', avail: 'Weekends, Sunday mornings', badge: true,
    bio: 'Corporate trainer and certified yoga teacher. Collector of houseplants.',
    offers: [['Public Speaking', 'EXPERT', 'Structure, storytelling and calming the nerves.'], ['Yoga', 'ADVANCED', 'Hatha basics for desk workers.'], ['Spoken English', 'ADVANCED', 'Everyday conversation practice.']],
    wants: [['Acoustic Guitar', 'BEGINNER'], ['Chess', 'BEGINNER']] },
  { name: 'Dev Joshi', email: 'dev@example.com', loc: 'Mumbai', avail: 'Weekday mornings',
    bio: 'Studied in Lyon for two years. Now learning tabla to annoy my neighbours.',
    offers: [['French', 'ADVANCED', 'Conversation and DELF A2 prep.'], ['Japanese', 'BEGINNER', 'Hiragana and katakana.']],
    wants: [['Tabla', 'BEGINNER'], ['Indian Home Cooking', 'BEGINNER']] },
  { name: 'Fatima Sheikh', email: 'fatima@example.com', loc: 'Bhopal', avail: 'Afternoons, weekends',
    bio: 'Grandmother of three, cook of a thousand dals. Wants to send emails without asking the grandkids.',
    offers: [['Indian Home Cooking', 'EXPERT', 'Everyday dal, sabzi and rotis.'], ['Knitting', 'EXPERT', 'Scarves, socks and sweaters.']],
    wants: [['Excel & Spreadsheets', 'BEGINNER'], ['Spoken English', 'BEGINNER']] },
];

async function seed() {
  const hash = await bcrypt.hash('password123', 10);
  await tx(async (db) => {
    const skillId = {};
    for (const [name, cat] of SKILLS) {
      const r = await db.query('INSERT INTO skills (name, category) VALUES ($1,$2) RETURNING id', [name, cat]);
      skillId[name] = r.rows[0].id;
    }
    const colors = ['#F4C9D6', '#F7D6C4', '#E6D3F2', '#CFE6D8', '#FBE3A8', '#D6E4F5'];
    const uid = {}; const lid = {};
    let i = 0;
    for (const u of USERS) {
      const r = await db.query(
        `INSERT INTO users (name, email, password_hash, date_of_birth, bio, location, availability, role, email_verified,
           trust_badge, verified_at, verify_method, avatar_color, created_at)
         VALUES ($1,$2,$3,'1999-05-14',$4,$5,$6,$7,TRUE,$8,$9,$10,$11, NOW() - ($12 || ' days')::interval) RETURNING id`,
        [u.name, u.email, hash, u.bio, u.loc, u.avail || '', u.role || 'user', !!u.badge,
         u.badge ? new Date() : null, u.badge ? 'OAUTH' : null, colors[i % colors.length], String(40 - i * 3)]);
      uid[u.email] = r.rows[0].id; i++;
      await credits.grantStarter(db, uid[u.email], 5);
      for (const [s, lvl, desc] of u.offers || []) {
        const l = await db.query(`INSERT INTO listings (user_id, skill_id, type, level, description) VALUES ($1,$2,'OFFER',$3,$4) RETURNING id`,
          [uid[u.email], skillId[s], lvl, desc]);
        lid[`${u.email}:${s}`] = l.rows[0].id;
      }
      for (const [s, lvl] of u.wants || []) {
        await db.query(`INSERT INTO listings (user_id, skill_id, type, level) VALUES ($1,$2,'WANT',$3)`, [uid[u.email], skillId[s], lvl]);
      }
    }
    const A = uid['aisha@example.com'], R = uid['rohan@example.com'], K = uid['kabir@example.com'],
          S = uid['sneha@example.com'], M = uid['meera@example.com'], P = uid['priya@example.com'];

    // 1) Object diagram: Rohan proposed Guitar for Python + 1 credit; completed and reviewed (CLOSED)
    let sw = await db.query(
      `INSERT INTO swaps (proposer_id, recipient_id, offered_listing_id, requested_listing_id, credits_offered, message, status,
         proposer_confirmed, recipient_confirmed, proposer_completed, recipient_completed, agreed_at, completed_at, created_at)
       VALUES ($1,$2,$3,$4,1,'Python for Guitar?','CLOSED',TRUE,TRUE,TRUE,TRUE,'2026-09-03','2026-09-10','2026-09-02') RETURNING id`,
      [R, A, lid['rohan@example.com:Acoustic Guitar'], lid['aisha@example.com:Python Programming']]);
    const s1 = sw.rows[0].id;
    await credits.hold(db, R, 1, s1);
    await credits.release(db, R, A, 1, s1);
    await db.query(`INSERT INTO sessions (swap_id, scheduled_at, duration_hours, mode, meeting_link, status, calendar_event_id)
      VALUES ($1,'2026-09-10 17:00+05:30',1.0,'VIRTUAL','https://meet.google.com/abc-defg-hij','COMPLETED','evt_demo01')`, [s1]);
    await db.query(`INSERT INTO reviews (swap_id, reviewer_id, reviewee_id, rating, comment, created_at) VALUES
      ($1,$2,$3,5,'Great teacher! I can play three songs now.','2026-09-11'), ($1,$3,$2,4,'Clear and patient. Python finally makes sense.','2026-09-11')`, [s1, A, R]);
    for (const [ev, actor, d] of [['PROPOSED', R, 'Offers Acoustic Guitar + 1 credits'], ['ACCEPTED', A, ''], ['SCHEDULED', null, ''], ['COMPLETED', null, '1 credits released'], ['CLOSED', null, '']])
      await db.query('INSERT INTO swap_events (swap_id, actor_id, event, detail) VALUES ($1,$2,$3,$4)', [s1, actor, ev, d]);

    // 2) Kabir → Aisha: pending proposal (Photography for Python), waiting on Aisha
    sw = await db.query(
      `INSERT INTO swaps (proposer_id, recipient_id, offered_listing_id, requested_listing_id, credits_offered, message, status, awaiting_user_id)
       VALUES ($1,$2,$3,$4,0,'Hi Aisha! I’d love to learn enough Python to automate renaming my photo exports. Happy to teach you manual-mode photography in return.','PROPOSED',$2) RETURNING id`,
      [K, A, lid['kabir@example.com:Photography'], lid['aisha@example.com:Python Programming']]);
    await db.query(`INSERT INTO swap_events (swap_id, actor_id, event, detail) VALUES ($1,$2,'PROPOSED','Offers Photography')`, [sw.rows[0].id, K]);
    await db.query(`INSERT INTO notifications (user_id, type, content, link) VALUES ($1,'PROPOSAL','Kabir would like to learn Python Programming from you in exchange for Photography.',$2)`, [A, `/swaps/${sw.rows[0].id}`]);

    // 3) Aisha → Sneha: Yoga for 2 credits, scheduled
    sw = await db.query(
      `INSERT INTO swaps (proposer_id, recipient_id, offered_listing_id, requested_listing_id, credits_offered, message, status,
         proposer_confirmed, recipient_confirmed, agreed_at)
       VALUES ($1,$2,NULL,$3,2,'Could we do a beginner yoga session? My back hates my study desk.','SCHEDULED',TRUE,TRUE,NOW() - INTERVAL '1 day') RETURNING id`,
      [A, S, lid['sneha@example.com:Yoga']]);
    const s3 = sw.rows[0].id;
    await credits.hold(db, A, 2, s3);
    const when = new Date(Date.now() + 3 * 86400000); when.setUTCHours(1, 30, 0, 0);
    await db.query(`INSERT INTO sessions (swap_id, scheduled_at, duration_hours, mode, place, status, calendar_event_id, calendar_url)
      VALUES ($1,$2,1.0,'IN_PERSON','Nehru Park, Indore (main gate)','SCHEDULED','evt_demo02','https://calendar.google.com/calendar/render?action=TEMPLATE&text=SkillSwap%3A+Yoga')`, [s3, when]);
    for (const [ev, actor] of [['PROPOSED', A], ['ACCEPTED', S], ['TIME_PROPOSED', S], ['CONFIRMED', A], ['SCHEDULED', null]])
      await db.query('INSERT INTO swap_events (swap_id, actor_id, event) VALUES ($1,$2,$3)', [s3, actor, ev]);
    for (const [from, text, mins] of [[A, 'Hi Sneha! Thank you for accepting 😊', 300], [S, 'Of course! Bring a mat if you have one, otherwise a thick towel works.', 290], [A, 'Perfect, see you at the main gate.', 280]])
      await db.query(`INSERT INTO messages (swap_id, sender_id, content, sent_at) VALUES ($1,$2,$3, NOW() - ($4 || ' minutes')::interval)`, [s3, from, text, String(mins)]);

    // 4) Meera ↔ Priya: negotiating (Baking for Web Dev)
    sw = await db.query(
      `INSERT INTO swaps (proposer_id, recipient_id, offered_listing_id, requested_listing_id, credits_offered, message, status, awaiting_user_id)
       VALUES ($1,$2,$3,$4,0,'Teach me to build a site for my bakery? I’ll teach you sourdough.','NEGOTIATING',$1) RETURNING id`,
      [M, P, lid['meera@example.com:Baking'], lid['priya@example.com:Web Development']]);
    await credits.hold(db, M, 1, sw.rows[0].id);
    await db.query('UPDATE swaps SET credits_offered=1 WHERE id=$1', [sw.rows[0].id]);
    await db.query(`INSERT INTO swap_events (swap_id, actor_id, event, detail) VALUES ($1,$2,'PROPOSED','Offers Baking'), ($1,$3,'COUNTERED','1 credits · A full site is a lot of hours, could you add a credit?')`, [sw.rows[0].id, M, P]);

    // Some extra reviews so ratings show up in search
    const extra = [[S, uid['arjun@example.com'], 5, 'Arjun is a brilliant chess coach.'], [P, M, 5, 'Best banana bread of my life.'], [K, uid['dev@example.com'], 4, 'Fun French lessons!']];
    for (const [reviewee, reviewer, rating, comment] of extra) {
      const x = await db.query(`INSERT INTO swaps (proposer_id, recipient_id, status, completed_at) VALUES ($1,$2,'CLOSED',NOW() - INTERVAL '20 days') RETURNING id`, [reviewer, reviewee]);
      await db.query('INSERT INTO reviews (swap_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1,$2,$3,$4,$5)', [x.rows[0].id, reviewer, reviewee, rating, comment]);
    }
    await db.query(`INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ($1,$2,'Kept asking to move the chat to WhatsApp before we agreed on anything.')`, [M, uid['dev@example.com']]);
  });
  console.log('Seeded demo data. Log in as aisha@example.com / password123 (or admin@skillswap.local).');
}

module.exports = { seed };

if (require.main === module) {
  seed().then(end).catch((e) => { console.error(e); process.exit(1); });
}
