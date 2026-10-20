// Static site generator for the HPF Talent Hub. No dependencies: `node build.mjs` -> dist/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const site = JSON.parse(fs.readFileSync('data/site.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('data/trainees.json', 'utf8'));
const URL_BASE = (process.env.SITE_URL || site.url || '').replace(/\/$/, '');
// Contacts never live in the repo. Locally: data/contacts.json. On Vercel: CONTACTS_B64 env var
// (base64 of that same JSON). Without either, profiles say contact is available on request.
const contacts = process.env.CONTACTS_B64
  ? JSON.parse(Buffer.from(process.env.CONTACTS_B64, 'base64').toString('utf8'))
  : fs.existsSync('data/contacts.json') ? JSON.parse(fs.readFileSync('data/contacts.json', 'utf8')) : {};
if (!Object.keys(contacts).length) console.warn('Warning: no contacts found; profiles will hide contact buttons.');
const OUT = 'dist';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Assets are cached for 30 days, so URLs carry a content hash and change whenever the file does.
const hashes = {};
const v = file => {
  hashes[file] ??= crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
  return `${file}?v=${hashes[file]}`;
};
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const initials = n => n.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const first = n => n.split(' ')[0];

const icon = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  wa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" width="14" height="14"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  gh: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2"/></svg>',
};

// Normalise trainees for rendering.
const people = raw.map(p => {
  // Never publish a story that still holds the form's [placeholder] prompts.
  if (/\[[^\]]*\]|\be\.g\./i.test(p.story)) { console.warn(`Unfilled story template for ${p.id}; hiding it.`); p = { ...p, story: '' }; }
  const track = site.tracks[p.track];
  const working = Boolean(p.placement) || p.employedSelfReported;
  const status = p.placement
    ? p.placement.label + (p.placement.org ? ', ' + p.placement.org : '')
    : p.employedSelfReported ? 'Employed, open to offers' : 'Open to opportunities';
  // Most stories open with "My success story is about...": drop only that lead-in, keep their words.
  const lead = p.story.replace(/^my (success )?story is (about |that )?/i, '');
  const excerpt = (lead.charAt(0).toUpperCase() + lead.slice(1)).trim()
    || `${first(p.name)} is a ${track.label} trainee in the HPF Skills Development Program.`;
  return { ...p, photo: p.photo ? v(p.photo) : "", contact: contacts[p.id], trackInfo: track, working, status, excerpt, initials: initials(p.name) };
}).sort((a, b) => Boolean(b.photo) - Boolean(a.photo) || a.name.localeCompare(b.name));

// Cards lead with the skills that set a trainee apart, not the ones everyone in the track shares.
const baseline = {};
for (const t of Object.keys(site.tracks)) {
  const inTrack = people.filter(p => p.track === t);
  baseline[t] = inTrack.length ? inTrack[0].skills.filter(s => inTrack.every(p => p.skills.includes(s))) : [];
}
people.forEach(p => {
  const extra = p.skills.filter(s => !baseline[p.track].includes(s));
  p.cardSkills = [...extra, ...p.skills.filter(s => !extra.includes(s))].slice(0, 3);
});
const graduation = site.timeline.find(t => /graduation/i.test(t.title));
const gradDate = esc(graduation.when).replace(' ', '&nbsp;') + '&nbsp;2026';

// Skills sorted by how many trainees list them, for the filter.
const skillCount = {};
people.forEach(p => p.skills.forEach(s => { skillCount[s] = (skillCount[s] || 0) + 1; }));
const allSkills = Object.keys(skillCount).sort((a, b) => skillCount[b] - skillCount[a] || a.localeCompare(b));

// On cards the name sits right below the photo, so the image is decorative there.
const photoHtml = (p, root, eager = false, decorative = false) => p.photo
  ? `<img src="${root}${esc(p.photo)}" alt="${decorative ? '' : `Portrait of ${esc(p.name)}`}" width="560" height="720" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
  : `<div class="initials initials-${p.track}" ${decorative ? 'aria-hidden="true"' : `role="img" aria-label="${esc(p.name)}"`}><span>${esc(p.initials)}</span></div>`;

const head = ({ title, desc, root, pathName, image, jsonld }) => `<!doctype html>
<html lang="en" class="no-js" data-root="${root}">
<head>
<meta charset="utf-8">
<script>document.documentElement.classList.replace('no-js', 'js')</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#f4f2ef">
${URL_BASE ? `<link rel="canonical" href="${URL_BASE}${pathName}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${URL_BASE ? `<meta property="og:url" content="${URL_BASE}${pathName}">\n<meta property="og:image" content="${URL_BASE}/${image || 'assets/og.jpg'}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"></noscript>
<link rel="stylesheet" href="${root}style.css?v=${v('src/style.css').split('=')[1]}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="${root || './'}" aria-label="HPF Talent Hub home">
      <span class="logo-tile"><img src="${root}assets/hpf-logo.svg" alt="Human Practice Foundation" width="90" height="33"></span>
      <span class="brand-text">Talent Hub<small>${esc(site.programme)}</small></span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="${root}#trainees">Trainees</a>
      <a href="${root}#work">Their work</a>
      <a href="${root}#journey">Journey</a>
      <a href="${root}#recruiters">For recruiters</a>
    </nav>
    <button class="btn btn-soft btn-sm shortlist-btn" type="button" data-open-shortlist aria-haspopup="dialog" aria-controls="drawer" aria-expanded="false">${icon.list} Shortlist <span class="count" data-n="0">0</span><span class="sr"> saved</span></button>
  </div>
</header>`;

const foot = (root, isIndex = false) => `
<footer class="foot">
  <div class="wrap">
    <a class="logo-tile" href="${root || './'}" aria-label="HPF Talent Hub home"><img src="${root}assets/hpf-logo.svg" alt="" width="90" height="33"></a>
    <div><span class="tagline">When skills meet the people who need them. That's human practice.</span><br>${esc(site.programme)} · ${esc(site.cohort)} · Delivered with Power Learn Project Africa</div>
    <div class="foot-legal">${site.contactEmail ? `Hiring or investing? <a href="mailto:${esc(site.contactEmail)}?subject=${encodeURIComponent('HPF Talent Hub enquiry')}">Email the HPF team</a><br>` : ''}© ${new Date().getFullYear()} Human Practice Foundation Kenya</div>
  </div>
</footer>
<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="sl-title">
  <div class="drawer-bg" data-close></div>
  <div class="drawer-panel">
    <div class="drawer-head"><h2 id="sl-title">Your shortlist</h2><button class="x" type="button" data-close aria-label="Close shortlist">×</button></div>
    <p class="fine">Saved in this browser only. Share it with your hiring team, then reach out from each profile.</p>
    <ul class="sl-list" id="sl-list"></ul>
    <div class="drawer-actions" id="sl-actions" hidden>
      <button class="btn btn-primary btn-sm" type="button" id="sl-copy">Copy list</button>
      <button class="btn btn-ghost btn-sm" type="button" id="sl-email">Email list</button>
      ${site.contactEmail ? `<button class="btn btn-soft btn-sm" type="button" id="sl-intro" data-to="${esc(site.contactEmail)}">Ask HPF to introduce us</button>` : ''}
    </div>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script id="people-data" type="application/json">${JSON.stringify(people.map(p => ({
  id: p.id, name: p.name, track: p.track, trackShort: p.trackInfo.short, photo: p.photo, initials: p.initials,
  working: p.working, skills: p.skills, status: p.status,
  // Search text is only needed where the directory is.
  ...(isIndex ? { search: [p.name, p.trackInfo.label, p.status, p.interest, ...p.skills, p.story].join(' ').toLowerCase() } : {}),
}))).replace(/</g, '\\u003c')}</script>
<script src="${root}app.js?v=${v('src/app.js').split('=')[1]}" defer></script>
</body>
</html>`;

// The visible label stays in the accessible name ("Shortlist" or "Shortlisted", then the person).
const starBtn = p => `<button class="star" type="button" data-id="${p.id}" aria-pressed="false">${icon.star}<span class="star-label">Shortlist</span><span class="sr"> ${esc(p.name)}</span></button>`;

const card = p => `
<article class="card" data-id="${p.id}">
  <div class="card-photo">${photoHtml(p, '', false, true)}</div>
  <div class="card-body">
    <span class="track track-${p.track}">${esc(p.trackInfo.short)}</span>
    <h3><a href="t/${p.id}/">${esc(p.name)}</a></h3>
    <span class="status${p.working ? ' working' : ''}">${esc(p.status)}</span>
    <p class="card-excerpt">${esc(p.excerpt)}</p>
    <ul class="chips">${p.cardSkills.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <div class="card-foot"><span class="view-link">View profile</span>${starBtn(p)}</div>
  </div>
</article>`;

const timeline = () => `<ol class="tl">${site.timeline.map(t => `
  <li data-start="${t.start}" data-end="${t.end}">
    <span class="when">${esc(t.when)}</span><span class="now-tag">Now</span><span class="next-tag">Up next</span>
    <h3>${esc(t.title)}</h3>
    <p>${esc(t.text)}</p>
  </li>`).join('')}</ol>`;

const count = { mern: people.filter(p => p.track === 'mern').length, data: people.filter(p => p.track === 'data').length };
const medal = n => ['', '1st place', '2nd place', '3rd place'][n] || '';

// ---------- Index ----------
const indexHtml = head({
  title: 'HPF Talent Hub: meet our Full Stack and Data Analytics trainees',
  desc: `Profiles of ${people.length} trainees from the HPF Skills Development Program in Narok West, Kenya: their stories, skills, projects and contact details, for recruiters and investors.`,
  root: '', pathName: '/',
  jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Human Practice Foundation Kenya', url: URL_BASE || undefined, logo: URL_BASE ? URL_BASE + '/assets/hpf-logo.svg' : undefined },
}) + `
<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <picture class="hero-bg">
      <source media="(max-width: 720px)" srcset="${v('assets/img/hero-cohort-m.webp')}" width="720" height="900">
      <img src="${v('assets/img/hero-cohort.webp')}" alt="" width="1800" height="569" fetchpriority="high">
    </picture>
    <div class="wrap hero-inner">
      <p class="hero-kicker">${esc(site.programme)} · ${esc(site.cohort)}</p>
      <h1 id="hero-title">Hire talent that already <span>builds for real needs.</span></h1>
      <p class="hero-hook"><span class="hook-line"><span class="hook-pre">From the Maasai Mara:</span> <span class="hook" id="hook" aria-hidden="true">${esc(site.hooks[0])}</span></span><span class="sr">${site.hooks.map(esc).join(' ')}</span></p>
      <button class="hook-toggle" type="button" id="hook-toggle" aria-label="Pause rotating highlights" hidden>Pause</button>
      <p class="hero-lead">Meet ${people.length} young developers and data analysts graduating on ${gradDate}. See each person's story and skills, then contact them directly.</p>
      <div class="hero-cta">
        <a class="btn btn-light" href="#trainees">Meet the trainees</a>
        <a class="btn btn-outline-light" href="#work">See what they built</a>
      </div>
    </div>
    <p class="hero-credit">Cohort 1 with community and county partners, Narok West</p>
    <script id="hooks-data" type="application/json">${JSON.stringify(site.hooks).replace(/</g, '\\u003c')}</script>
  </section>
  <div class="wrap">
    <div class="stats">${site.stats.map(s => s.href
      ? `<a class="stat" href="${esc(s.href)}"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></a>`
      : `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>
  </div>

  <section id="trainees">
    <div class="wrap">
      <div class="dir-head">
        <div>
          <p class="eyebrow">The talent</p>
          <h2>Meet the trainees</h2>
        </div>
        <p>Filter by track, skill or availability. Open any profile for the full story, contact details and project links, or shortlist people to share with your team.</p>
      </div>
      <div class="filters" role="search">
        <label class="search"><span class="sr">Search trainees</span>${icon.search}<input id="q" type="search" placeholder="Search by name, skill or keyword" autocomplete="off"></label>
        <div class="seg" role="group" aria-label="Track">
          <button type="button" data-track="all" aria-pressed="true">All</button>
          <button type="button" data-track="mern" aria-pressed="false">Full Stack</button>
          <button type="button" data-track="data" aria-pressed="false">Data</button>
        </div>
        <div class="seg" role="group" aria-label="Availability">
          <button type="button" data-avail="all" aria-pressed="true">Anyone</button>
          <button type="button" data-avail="open" aria-pressed="false">Not yet working</button>
          <button type="button" data-avail="working" aria-pressed="false">Already working</button>
        </div>
        <label><span class="sr">Filter by skill</span><select id="skill" class="select"><option value="">Any skill</option>${allSkills.map(s => `<option value="${esc(s)}">${esc(s)} (${skillCount[s]})</option>`).join('')}</select></label>
      </div>
      <p class="result-line" id="result-line" aria-live="polite">Showing all ${people.length} trainees</p>
      <div class="grid" id="grid">${people.map(card).join('')}</div>
      <div class="empty" id="empty" hidden>No trainees match those filters. <button class="btn btn-soft btn-sm" type="button" id="reset">Clear filters</button></div>
    </div>
  </section>

  <section id="work" class="dir">
    <div class="wrap">
      <p class="eyebrow">Their work</p>
      <h2>Apps built by trainees, live today</h2>
      <p class="lead">Each tool answers a real need in the Mara. Teams built and pitched them at the HPF x PLP Hackathon. Try them yourself.</p>
      <div class="sol-grid">${site.solutions.map(s => `
        <article class="sol">
          ${s.podium ? `<span class="medal">${medal(s.podium)}</span>` : ''}
          <span class="tag">${esc(s.tag)}</span>
          <h3>${esc(s.name)}</h3>
          <p>${esc(s.text)}</p>
          <a href="${esc(s.url)}" target="_blank" rel="noopener">Open live app ${icon.ext}</a>
        </article>`).join('')}
      </div>
      <div class="photo-strip">
        <figure><img src="${v('assets/img/winners-1.webp')}" alt="The Mara Smart Herd Tracker team holding their prize cheque at the HPF x PLP Hackathon" loading="lazy" width="1600" height="911"><figcaption><b>2nd place, with the cheque to prove it.</b> The Mara Smart Herd Tracker team, 11 September 2026.</figcaption></figure>
        <figure><img src="${v('assets/img/demo.webp')}" alt="A trainee presenting a platform on screen at the hackathon" loading="lazy" width="1600" height="900"><figcaption><b>Every team pitched a working app.</b> Demo day at the hackathon.</figcaption></figure>
        <figure><img src="${v('assets/img/community-2.webp')}" alt="Parents, elders and local leaders watching the pitches" loading="lazy" width="1600" height="900"><figcaption><b>The whole community came to watch.</b> Parents, elders and leaders at Community Day.</figcaption></figure>
      </div>
    </div>
  </section>

  <section id="journey">
    <div class="wrap split">
      <div>
        <p class="eyebrow">The journey</p>
        <h2>Two tracks, one cohort, real projects</h2>
        <p class="lead">Every trainee started with the same foundations, then chose a specialisation taught by Power Learn Project Africa.</p>
        <div class="track-cards">
          <div class="track-card"><h3>${esc(site.tracks.mern.label)}</h3><p>${esc(site.tracks.mern.blurb)}</p><p class="n">${count.mern} trainees · <a href="?track=mern#trainees">View them</a></p></div>
          <div class="track-card data"><h3>${esc(site.tracks.data.label)}</h3><p>${esc(site.tracks.data.blurb)}</p><p class="n">${count.data} trainees · <a href="?track=data#trainees">View them</a></p></div>
        </div>
      </div>
      <div>${timeline()}</div>
    </div>
  </section>

  <section id="recruiters">
    <div class="wrap">
      <div class="band">
        <div>
          <p class="eyebrow">For recruiters and investors</p>
          <h2>Find your next hire in three steps</h2>
          <p>Capstone projects are presented at Demo Day, 20 to 26 November, and Cohort 1 graduates on 26 November 2026. Start a conversation now.</p>
          <div class="band-cta">
            ${site.contactEmail ? `<a class="btn btn-primary" href="mailto:${esc(site.contactEmail)}?subject=${encodeURIComponent('HPF Talent Hub enquiry')}">Talk to the HPF team</a>` : `<a class="btn btn-primary" href="#trainees">Browse trainees</a>`}
            <button class="btn btn-outline-light" type="button" data-open-shortlist aria-haspopup="dialog" aria-controls="drawer">${icon.list} Open your shortlist</button>
          </div>
        </div>
        <ol>
          <li><span><b>Browse and filter</b> by track, skill or availability.</span></li>
          <li><span><b>Shortlist</b> the people who fit and share the list with your team.</span></li>
          <li><span><b>Reach out directly</b> by email or WhatsApp from each profile.</span></li>
        </ol>
      </div>
    </div>
  </section>
</main>` + foot('', true);

// ---------- Profile pages ----------
const profile = (p, i) => {
  const root = '../../';
  // Rotate through the track so every trainee is linked from somewhere.
  const pool = people.filter(o => o.track === p.track);
  const at = pool.indexOf(p);
  const others = [...pool.slice(at + 1), ...pool.slice(0, at)].slice(0, 6);
  const availability = p.placement ? `Now working: ${esc(p.status)}`
    : p.employedSelfReported ? 'Employed and open to new opportunities' : 'Open to opportunities';
  const links = [
    p.links.github && `<a class="btn btn-soft btn-sm" href="${esc(p.links.github)}" target="_blank" rel="noopener">${icon.gh} GitHub</a>`,
    p.links.linkedin && `<a class="btn btn-soft btn-sm" href="${esc(p.links.linkedin)}" target="_blank" rel="noopener">LinkedIn ${icon.ext}</a>`,
    p.links.portfolio && `<a class="btn btn-soft btn-sm" href="${esc(p.links.portfolio)}" target="_blank" rel="noopener">Portfolio ${icon.ext}</a>`,
  ].filter(Boolean).join('');
  const c = p.capstone || {};
  const capstone = c.title ? `
    <div class="capstone filled">
      <h3>${esc(c.title)}</h3>
      ${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
      <div class="link-row">
        ${c.demo ? `<a class="btn btn-primary btn-sm" href="${esc(c.demo)}" target="_blank" rel="noopener">Live demo ${icon.ext}</a>` : ''}
        ${c.repo ? `<a class="btn btn-ghost btn-sm" href="${esc(c.repo)}" target="_blank" rel="noopener">${icon.gh} Source code</a>` : ''}
      </div>
    </div>` : `
    <div class="capstone">
      <h3>Capstone project coming soon</h3>
      <p>${esc(first(p.name))} presents a capstone project at Demo Day, 20 to 26 November 2026. The demo and source code will appear here once submitted.</p>
      <p><a href="${root}#work">Until then, see the apps Cohort 1 built at the HPF x PLP Hackathon →</a></p>
    </div>`;
  const introBtn = site.contactEmail
    ? `<a class="btn btn-primary reveal" href="mailto:${esc(site.contactEmail)}?subject=${encodeURIComponent('Introduction to ' + p.name + ' (HPF Talent Hub)')}">${icon.mail}<span>Ask HPF to introduce you</span></a>` : '';
  const contact = p.hideContact || !p.contact
    ? `${introBtn ? `<div class="contact-list">${introBtn}</div>` : ''}<p class="fine">Contact details on request from the HPF team.</p>` : `
      <div class="contact-list" data-first="${esc(first(p.name))}">
        <button class="btn btn-primary reveal" type="button" data-kind="wa" data-v="${b64(p.contact.phone)}">${icon.wa}<span>Message on WhatsApp</span></button>
        <button class="btn btn-soft reveal" type="button" data-kind="email" data-v="${b64(p.contact.email)}">${icon.mail}<span>Show email</span></button>
        <button class="btn btn-soft reveal" type="button" data-kind="phone" data-v="${b64(p.contact.phone)}">${icon.phone}<span>Show phone</span></button>
      </div>
      <p class="fine">Your message will say you found ${esc(first(p.name))} on the HPF Talent Hub.</p>
      <noscript><p class="fine">Turn on JavaScript to see ${esc(first(p.name))}'s contact details.</p></noscript>`;

  return head({
    title: `${p.name}, ${p.trackInfo.label} | HPF Talent Hub`,
    desc: `${p.name} is a ${p.trackInfo.label} trainee in the HPF Skills Development Program, Narok West. Skills: ${p.skills.slice(0, 5).join(', ')}.`,
    root, pathName: `/t/${p.id}/`,
    image: p.photo || undefined,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Person', name: p.name,
      jobTitle: p.placement ? p.placement.label : `${p.trackInfo.label} trainee`,
      knowsAbout: p.skills,
      image: URL_BASE && p.photo ? `${URL_BASE}/${p.photo}` : undefined,
      affiliation: { '@type': 'Organization', name: 'Human Practice Foundation Kenya' },
      address: { '@type': 'PostalAddress', addressRegion: 'Narok', addressCountry: 'KE' },
    },
  }) + `
<main id="main">
  <div class="wrap crumbs"><a href="${root}#trainees" id="back-link">← All trainees</a></div>
  <div class="wrap profile">
    <div class="profile-grid">
      <header class="profile-head">
        <p class="eyebrow">${esc(site.programme)} · ${esc(site.cohort)}</p>
        <h1>${esc(p.name)}</h1>
        <div class="meta"><span class="track track-${p.track}">${esc(p.trackInfo.label)}</span></div>
        <div class="placement${p.working ? '' : ' open'}">${availability}. Graduates ${gradDate}.</div>
      </header>
      <aside class="profile-side" aria-label="Contact and actions">
        <div class="portrait">${photoHtml(p, root, true)}</div>
        <div class="panel">
          <h2>Contact ${esc(first(p.name))}</h2>
          ${contact}
        </div>
        <div class="panel actions">
          ${starBtn(p)}
          <button class="star" type="button" data-share>${icon.share}<span>Share profile</span></button>
        </div>
      </aside>
      <article class="profile-main">

        <section class="block" aria-labelledby="s-story">
          <h2 id="s-story">${esc(first(p.name))}'s story</h2>
          ${p.quote ? `<blockquote>“${esc(p.quote)}”<cite>${esc(p.name)}</cite></blockquote>` : ''}
          <p class="story">${esc(p.story || `${first(p.name)} is a ${p.trackInfo.label} trainee and will share their story here soon.`)}</p>
          ${p.instructorNote ? `<div class="note"><b>From the instructor</b><p>${esc(p.instructorNote)}</p></div>` : ''}
        </section>

        <section class="block" aria-labelledby="s-skills">
          <h2 id="s-skills">Skills</h2>
          <ul class="chips lg">${p.skills.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
          <p class="fine">${esc(p.trackInfo.blurb)} All trainees also hold a Learnio graphic design certificate.</p>
          ${links ? `<div class="link-row">${links}</div>` : ''}
        </section>

        <section class="block" aria-labelledby="s-capstone">
          <h2 id="s-capstone">Capstone project</h2>
          ${capstone}
        </section>

        <section class="block" aria-labelledby="s-journey">
          <h2 id="s-journey">Journey so far</h2>
          ${timeline()}
        </section>

        ${others.length ? `<section class="block" aria-labelledby="s-more">
          <h2 id="s-more">More ${esc(p.trackInfo.short)} trainees</h2>
          <div class="more">${others.map(o => `<a href="${root}t/${o.id}/"><span class="av">${o.photo ? `<img src="${root}${o.photo}" alt="" loading="lazy">` : esc(o.initials)}</span><span>${esc(o.name)}<small>${esc(o.status)}</small></span></a>`).join('')}</div>
        </section>` : ''}
      </article>
    </div>
  </div>
</main>` + foot(root);
};

// ---------- Write ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync('assets', path.join(OUT, 'assets'), { recursive: true });
fs.copyFileSync('src/style.css', path.join(OUT, 'style.css'));
fs.copyFileSync('src/app.js', path.join(OUT, 'app.js'));
fs.writeFileSync(path.join(OUT, 'index.html'), indexHtml);
people.forEach((p, i) => {
  fs.mkdirSync(path.join(OUT, 't', p.id), { recursive: true });
  fs.writeFileSync(path.join(OUT, 't', p.id, 'index.html'), profile(p, i));
});
fs.writeFileSync(path.join(OUT, '404.html'), head({ title: 'Page not found | HPF Talent Hub', desc: 'Page not found', root: '/', pathName: '/404' }) +
  `<main id="main"><section><div class="wrap"><h1>We could not find that page.</h1><p class="lead">The profile may have moved.</p><a class="btn btn-primary" href="/#trainees">See all trainees</a></div></section></main>` + foot('/'));
if (URL_BASE) {
  const urls = ['/', ...people.map(p => `/t/${p.id}/`)];
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${URL_BASE}${u}</loc></url>`).join('')}</urlset>\n`);
}
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n${URL_BASE ? `Sitemap: ${URL_BASE}/sitemap.xml\n` : ''}`);
console.log(`Built ${people.length} profiles into ${OUT}/`);
