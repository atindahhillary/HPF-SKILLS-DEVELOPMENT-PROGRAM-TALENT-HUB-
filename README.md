# HPF Talent Hub

One place where recruiters and investors can meet the trainees of the **HPF Skills Development Program** (Cohort 1, Narok West). Each trainee has a profile with their photo, story, skills, journey, capstone project and contact details.

- Static site, no framework, no runtime dependencies. Every profile is its own page at `/t/<name>/`, so it loads fast and can be shared.
- Recruiters can filter by track, skill and availability, shortlist trainees, and copy or email the list to their team.
- Contact details are encoded in the page and shown when someone clicks, so simple scrapers can't harvest them.
- Branding (Open Sans, ink, HPF blue, lavender, cream, logo) comes from the HPF slide master.

## Updating a profile

Edit `data/trainees.json` and push to `main`. Vercel rebuilds automatically.

| Field | What it does |
| --- | --- |
| `story`, `quote`, `instructorNote` | Text on the profile |
| `skills` | Chips on the card and profile, and the skill filter |
| `links.github`, `links.linkedin`, `links.portfolio` | Buttons on the profile (hidden when empty) |
| `capstone.title`, `summary`, `demo`, `repo` | Fills the Capstone section (a "coming soon" note shows until `title` is set) |
| `placement` | `{ "label": "...", "org": "...", "kind": "job" }` marks someone as working |
| `photo` | Path to a 640×800 image in `assets/photos/` (initials show when empty) |
| `hideContact` | `true` hides that trainee's contact buttons |

Programme facts, the live apps and the timeline are in `data/site.json`. Set `contactEmail` there to add a "Talk to the HPF team" button.

## Contact details are not in this repo

The repo is public, so trainee emails and phone numbers stay out of it.

- **Locally**, they live in `data/contacts.json`, which is gitignored and shaped like `{ "<id>": { "email": "...", "phone": "+254..." } }`.
- **On Vercel**, the build reads the `CONTACTS_B64` environment variable, which is that same JSON in base64. After changing contacts, update the variable and redeploy:

```bash
node -e "process.stdout.write(Buffer.from(require('fs').readFileSync('data/contacts.json')).toString('base64'))"
```

## Commands

```bash
npm run dev      # build and preview at http://localhost:4321
npm run build    # write the site to dist/
```

`npm run ingest -- <learner-interests.xlsx> <unzipped-deck-folder>` rebuilds the data and images from the original spreadsheet and slide deck. You only need it if those sources change. It overwrites manual edits.
