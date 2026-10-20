// One-off ingest: spreadsheet + deck media -> data/trainees.json, data/contacts.json, assets/*.
// Re-run only if the spreadsheet changes. Day-to-day edits go straight into data/trainees.json.
// Usage: node tools/ingest.cjs <learner-interests.xlsx> <unzipped-deck-folder>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const X = require('xlsx');

const ROOT = path.join(__dirname, '..');
const XLSX = process.argv[2];
const MEDIA = path.join(process.argv[3] || '', 'ppt/media') + '/';
if (!XLSX || !process.argv[3]) { console.error('Usage: node tools/ingest.cjs <xlsx> <unzipped-deck-folder>'); process.exit(1); }

const wb = X.readFile(XLSX);
const rows = X.utils.sheet_to_json(wb.Sheets['Form Responses 1'], { header: 1, defval: '' }).slice(1).filter(r => r[1]);
const groups = X.utils.sheet_to_json(wb.Sheets['Hackathon Groups'], { header: 1, defval: '' }).slice(1);

const clean = s => String(s).replace(/\s+/g, ' ').trim();
const title = s => clean(s).toLowerCase().replace(/(^|[\s-])\w/g, m => m.toUpperCase());
const slug = s => clean(s).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const phone = p => {
  const d = String(p).replace(/\D/g, '');
  if (d.startsWith('254')) return '+' + d;
  if (d.startsWith('0')) return '+254' + d.slice(1);
  return '+254' + d;
};

// Hackathon groups are the authoritative track and group per trainee.
const byEmail = {};
let g = '';
for (const r of groups) {
  if (r[0]) g = r[0];
  if (r[1]) byEmail[String(r[4]).toLowerCase().trim()] = { group: Number(g.replace(/\D/g, '')), track: /mern/i.test(r[2]) ? 'mern' : 'data' };
}

// Name overrides: the form is the source, corrected where the deck or email shows a different spelling.
const NAME_FIX = { 'Senoi Naurori': 'Seenoi Naurori', 'Beatrice Simaloi': 'Beatrice Simaloi Ketere' };

// Placement facts come from the donor deck (slides 3 and 11), not the form.
const PLACEMENT = {
  'solomon-munke-njapit': { label: 'Graphic design intern', org: 'The Maa Trust', kind: 'internship' },
  'george-tipango': { label: 'ICT teacher', org: 'Maasai Mara High School', kind: 'job' },
  'seema-letoluo': { label: 'Freelance web developer', org: '', kind: 'freelance' },
  'john-sanare-muli': { label: 'Freelance web developer', org: '', kind: 'freelance' },
};

const TRACK_SKILLS = {
  mern: ['MongoDB', 'Express.js', 'React', 'Node.js', 'Git and GitHub', 'HTML'],
  data: ['Python', 'Data cleaning', 'Data analysis', 'Data presentation'],
};
const KEYWORDS = ['Excel', 'Google Colab', 'GitHub', 'SQL', 'Power BI', 'Tableau', 'Graphic design', 'Digital marketing', 'Canva', 'Python', 'JavaScript', 'React', 'Node', 'MongoDB', 'Figma', 'Data visualization', 'Machine learning', 'Problem-solving', 'Teamwork', 'Leadership'];

const DECK_STORIES = { // direct quotes from the donor deck, slide 11
  'stacy-sakat': 'I have gained practical experience in building web applications, solving problems, and using GitHub.',
  'seenoi-naurori': 'Despite challenges such as not having my own laptop, I remain committed to learning and building a successful career in tech.',
};

const people = rows.map((r, i) => {
  const rawName = clean(r[1]);
  const name = NAME_FIX[title(rawName)] || title(rawName);
  const id = slug(name);
  const email = clean(r[2]).toLowerCase();
  const grp = byEmail[email] || byEmail[clean(r[9]).toLowerCase()] || {};
  // A story that still contains the form's [placeholder] prompts is treated as not submitted.
  const story = /\[[^\]]*\]|\be\.g\./i.test(clean(r[7])) ? '' : clean(r[7]);
  const found = KEYWORDS.filter(k => new RegExp('\\b' + k.replace(/[.+]/g, '\\$&') + '\\b', 'i').test(story));
  const track = grp.track || (/data/i.test(r[6]) ? 'data' : 'mern');
  const skills = [...new Set([...TRACK_SKILLS[track], ...found])];
  let note = clean(r[10]);
  // Personal family detail removed from the public note; the rest is the instructor's own wording.
  note = note.replace(/\s*She handles being a mom and being a grade A student better that anyone I have ever interacted with, and I have interacted with a few\./i, ' She handles her studies with remarkable discipline.');
  return {
    id, name, track, group: grp.group || null,
    interest: clean(r[6]),
    story: story.length > 40 ? story : '',
    quote: DECK_STORIES[id] || '',
    instructorNote: note,
    employedSelfReported: /^yes/i.test(r[5]),
    placement: PLACEMENT[id] || null,
    photoSource: String(r[8]),
    skills,
    contact: { email, phone: phone(r[3]) },
    links: { github: '', linkedin: '', portfolio: '' },
    capstone: { title: '', summary: '', repo: '', demo: '' },
    hideContact: false,
  };
}).sort((a, b) => a.name.localeCompare(b.name));

(async () => {
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'assets/photos'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'assets/img'), { recursive: true });

  // Photos from public Drive links; missing or private ones fall back to initials in the UI.
  for (const p of people) {
    const m = p.photoSource.match(/\/d\/([\w-]+)/);
    p.photo = '';
    if (!m) continue;
    try {
      const res = await fetch('https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1000');
      if (!(res.headers.get('content-type') || '').startsWith('image')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize(640, 800, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toFile(path.join(ROOT, 'assets/photos', p.id + '.webp'));
      p.photo = 'assets/photos/' + p.id + '.webp';
    } catch (e) { console.log('photo failed', p.name, e.message); }
  }
  for (const p of people) delete p.photoSource;

  // Deck imagery
  const IMG = { 'winners-1': 'image11.jpeg', 'winners-2': 'image12.jpeg', 'cohort': 'image7.jpg', 'pitch': 'image16.jpeg', 'community': 'image15.jpeg', 'community-2': 'image14.jpeg', 'demo': 'image22.jpg', 'graduates': 'image5.jpg' };
  for (const [k, f] of Object.entries(IMG)) {
    await sharp(MEDIA + f).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(ROOT, 'assets/img', k + '.webp'));
  }
  // Social preview image
  await sharp(MEDIA + 'image11.jpeg').resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 80 }).toFile(path.join(ROOT, 'assets/og.jpg'));

  // Logo: crop the SVG viewBox to the drawn paths.
  let svg = fs.readFileSync(MEDIA + 'image2.svg', 'utf8');
  const nums = [...svg.matchAll(/ d="([^"]+)"/g)].flatMap(m => m[1].match(/-?\d*\.?\d+/g).map(Number));
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 2;
  svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}"`);
  fs.writeFileSync(path.join(ROOT, 'assets/hpf-logo.svg'), svg);

  // Contacts stay out of the public repo: data/contacts.json is gitignored.
  const contacts = {};
  for (const p of people) { contacts[p.id] = p.contact; delete p.contact; }
  fs.writeFileSync(path.join(ROOT, 'data/contacts.json'), JSON.stringify(contacts, null, 2));
  fs.writeFileSync(path.join(ROOT, 'data/trainees.json'), JSON.stringify(people, null, 2));
  console.log(people.length, 'trainees;', people.filter(p => p.photo).length, 'photos');
  console.log('logo bbox', x0, y0, x1, y1);
})();
