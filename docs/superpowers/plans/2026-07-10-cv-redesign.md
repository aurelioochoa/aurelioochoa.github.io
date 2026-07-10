# CV Redesign & Language Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated binary-only CV PDFs with three redesigned, content-updated CVs (EN/ES/DE) built from version-controlled HTML/CSS source, and wire a language switcher into the website so all content — including the CV link — follows the visitor's language.

**Architecture:** A `cv/` folder holds one HTML template with mustache-style tokens, one print CSS, and three data JSONs; a Node script renders each language through headless Chrome (Puppeteer) into `assets/pdf/`. The site gets a small `i18n.js` module that detects the language (localStorage → navigator.language → en), applies the language JSON to the DOM before the existing timeline/modal init, and renders a fixed EN·ES·DE toggle that persists via localStorage + page reload.

**Tech Stack:** Node 22 (ES modules, `node:test`), Puppeteer, `@fontsource-variable/inter`, poppler CLI tools (`pdftotext`, `pdfinfo`, `pdfimages`) for verification. Site stays dependency-free vanilla JS.

## Global Constraints

- Work on branch `cv-redesign`.
- Repo root: `/home/aurelio/Repos/aurelioochoa.github.io` (all paths below relative to it).
- Output PDF filenames exactly: `Resume Ochoa.pdf` (EN, no photo), `Curriculum Ochoa.pdf` (ES, photo), `Lebenslauf Ochoa.pdf` (DE, photo) in `assets/pdf/`.
- Each PDF: A4, exactly 1 page, real selectable text (ATS-parseable).
- npm dependencies allowed only inside `cv/` (`puppeteer`, `@fontsource-variable/inter`). No frameworks or build steps for the site itself.
- `cv/node_modules/` and generated `.build-*.html` files are never committed; generated PDFs ARE committed (GitHub Pages serves them).
- Accent color `#0f6d6a`; headings in Fraunces (repo font), body in Inter.
- Commit after every task with the trailer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: CV project scaffold + photo extraction

**Files:**
- Create: `cv/package.json`
- Create: `cv/.gitignore`
- Create: `cv/photo.jpg` (extracted from the old Spanish CV)

**Interfaces:**
- Produces: installed `puppeteer` and `@fontsource-variable/inter` packages under `cv/node_modules/`; `cv/photo.jpg` referenced later by `cv/template.html`.

- [ ] **Step 1: Create `cv/package.json`**

```json
{
  "name": "cv-builder",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.js",
    "test": "node --test"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.2.5",
    "puppeteer": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `cv/.gitignore`**

```gitignore
node_modules/
.build-*.html
old-photo*
```

- [ ] **Step 3: Install dependencies**

Run: `cd cv && npm install`
Expected: exit 0; `cv/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2` exists (verify with `ls`). Puppeteer downloads its Chrome build.

- [ ] **Step 4: Verify Puppeteer can launch Chrome**

Run: `cd cv && node -e "import('puppeteer').then(async ({default: p}) => { const b = await p.launch(); console.log('chrome ok', await b.version()); await b.close(); })"`
Expected: prints `chrome ok Chrome/...`. If launch fails with a sandbox error on Arch, retry with `p.launch({ args: ['--no-sandbox'] })` — and if that is what works, use the same args in `build.js` (Task 4).

- [ ] **Step 5: Extract the photo from the old Spanish CV**

Run: `cd cv && pdfimages -all "../assets/pdf/Curriculum Ochoa.pdf" old-photo && ls -la old-photo*`
Expected: one or more image files. Identify the portrait (roughly square, likely the largest `.jpg`): `magick identify old-photo*` shows dimensions. View the candidate with the Read tool to confirm it is the headshot, then:

Run: `mv old-photo-000.jpg photo.jpg && rm -f old-photo*` (adjust the index to whichever file is the portrait)
Expected: `cv/photo.jpg` exists and is the headshot.

- [ ] **Step 6: Commit**

```bash
git add cv/package.json cv/package-lock.json cv/.gitignore cv/photo.jpg
git commit -m "Scaffold CV builder project and extract photo"
```

---

### Task 2: Template renderer (TDD)

**Files:**
- Create: `cv/render.js`
- Test: `cv/render.test.js`

**Interfaces:**
- Produces: `render(template: string, data: object): string` — substitutes `{{path.to.key}}` (HTML-escaped), `{{#each path}}...{{/each}}` (item bound to `this`), `{{#if path}}...{{/if}}`; **throws** `Error("Missing key \"<path>\" in data")` on any missing key so builds fail loudly. Consumed by `build.js` (Task 4) and the Task 3 smoke test.

- [ ] **Step 1: Write the failing tests — `cv/render.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from './render.js';

test('interpolates dotted paths and escapes HTML', () => {
  assert.equal(render('<p>{{a.b}}</p>', { a: { b: '<x> & y' } }), '<p>&lt;x&gt; &amp; y</p>');
});

test('throws on missing key', () => {
  assert.throws(() => render('{{nope}}', {}), /Missing key "nope"/);
});

test('renders each blocks with this context, including nested', () => {
  const tpl = '{{#each jobs}}<h3>{{this.role}}</h3>{{#each this.bullets}}<li>{{this}}</li>{{/each}}{{/each}}';
  const data = { jobs: [{ role: 'Dev', bullets: ['a', 'b'] }, { role: 'Ops', bullets: [] }] };
  assert.equal(render(tpl, data), '<h3>Dev</h3><li>a</li><li>b</li><h3>Ops</h3>');
});

test('if blocks include or omit content', () => {
  assert.equal(render('{{#if photo}}<img>{{/if}}ok', { photo: false }), 'ok');
  assert.equal(render('{{#if photo}}<img>{{/if}}ok', { photo: true }), '<img>ok');
});

test('throws on unclosed block', () => {
  assert.throws(() => render('{{#each xs}}<li>', { xs: [] }), /Unclosed/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cv && node --test render.test.js`
Expected: FAIL — cannot find module `./render.js`.

- [ ] **Step 3: Implement `cv/render.js`**

```js
// Minimal mustache-style renderer for the CV template.
// Supports {{path.to.key}} (HTML-escaped), {{#each path}}...{{/each}}
// (current item bound to "this"), and {{#if path}}...{{/if}}.
// Any missing key throws, so a data file that drifts from the
// template fails the build loudly instead of printing blanks.

function lookup(data, path) {
  return path.split('.').reduce((obj, key) => {
    if (obj == null || typeof obj !== 'object' || !(key in obj)) {
      throw new Error(`Missing key "${path}" in data`);
    }
    return obj[key];
  }, data);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function interpolate(text, data) {
  return text.replace(/{{([\w.]+)}}/g, (_, path) => escapeHtml(String(lookup(data, path))));
}

export function render(template, data) {
  const openRe = /{{#(each|if) ([\w.]+)}}/;
  let out = '';
  let rest = template;
  let m;
  while ((m = rest.match(openRe))) {
    out += interpolate(rest.slice(0, m.index), data);
    const [open, kind, path] = m;
    const bodyStart = m.index + open.length;
    const tagRe = /{{#(?:each|if) [\w.]+}}|{{\/(?:each|if)}}/g;
    tagRe.lastIndex = bodyStart;
    let depth = 1;
    let bodyEnd = -1;
    let closeEnd = -1;
    let tag;
    while ((tag = tagRe.exec(rest))) {
      depth += tag[0][2] === '#' ? 1 : -1;
      if (depth === 0) {
        bodyEnd = tag.index;
        closeEnd = tagRe.lastIndex;
        break;
      }
    }
    if (bodyEnd < 0) throw new Error(`Unclosed {{#${kind} ${path}}}`);
    const body = rest.slice(bodyStart, bodyEnd);
    const value = lookup(data, path);
    if (kind === 'each') {
      for (const item of value) out += render(body, { ...data, this: item });
    } else if (value) {
      out += render(body, data);
    }
    rest = rest.slice(closeEnd);
  }
  return out + interpolate(rest, data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cv && node --test render.test.js`
Expected: 5 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add cv/render.js cv/render.test.js
git commit -m "Add mustache-style template renderer with tests"
```

---

### Task 3: CV template, stylesheet, and English data

**Files:**
- Create: `cv/template.html`
- Create: `cv/cv.css`
- Create: `cv/data/en.json`

**Interfaces:**
- Consumes: `render()` from `cv/render.js`.
- Produces: the template/CSS contract used by all three data files. Every data JSON MUST provide the exact key tree shown in `en.json` below (`meta.outputFile`, `meta.lang`, `meta.photo`, `meta.dob`, `name`, `title`, `contact.*`, `labels.*`, `profile`, `experience[].{role,company,location,dates,bullets[]}`, `certifications[].{name,issuer,year}`, `education[].{degree,school}`, `skills[].{group,items}`, `languages[].{name,level}`).

- [ ] **Step 1: Create `cv/template.html`**

```html
<!DOCTYPE html>
<html lang="{{meta.lang}}">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="cv.css">
  <title>{{name}}</title>
</head>
<body>
  <header>
    <div class="header-text">
      <h1>{{name}}</h1>
      <p class="tagline">{{title}}</p>
    </div>
    {{#if meta.photo}}<img class="photo" src="photo.jpg" alt="">{{/if}}
  </header>
  <div class="columns">
    <aside>
      <section>
        <h2>{{labels.contact}}</h2>
        <ul class="contact">
          <li>{{contact.location}}</li>
          <li>{{contact.email}}</li>
          <li>{{contact.phone}}</li>
          <li>linkedin.com/in/{{contact.linkedin}}</li>
          <li>{{contact.website}}</li>
          {{#if meta.dob}}<li>{{labels.dob}}: {{meta.dob}}</li>{{/if}}
        </ul>
      </section>
      <section>
        <h2>{{labels.skills}}</h2>
        {{#each skills}}
        <h3>{{this.group}}</h3>
        <p class="skill-items">{{this.items}}</p>
        {{/each}}
      </section>
      <section>
        <h2>{{labels.certifications}}</h2>
        {{#each certifications}}
        <p class="cert"><strong>{{this.name}}</strong><br>{{this.issuer}} · {{this.year}}</p>
        {{/each}}
      </section>
      <section>
        <h2>{{labels.languages}}</h2>
        <ul class="languages">
          {{#each languages}}<li><span>{{this.name}}</span><span class="level">{{this.level}}</span></li>{{/each}}
        </ul>
      </section>
    </aside>
    <main>
      <section>
        <h2>{{labels.profile}}</h2>
        <p>{{profile}}</p>
      </section>
      <section>
        <h2>{{labels.experience}}</h2>
        {{#each experience}}
        <article>
          <div class="role-line">
            <h3>{{this.role}}</h3>
            <span class="dates">{{this.dates}}</span>
          </div>
          <p class="company">{{this.company}} · {{this.location}}</p>
          <ul>
            {{#each this.bullets}}<li>{{this}}</li>{{/each}}
          </ul>
        </article>
        {{/each}}
      </section>
      <section>
        <h2>{{labels.education}}</h2>
        {{#each education}}
        <p class="edu"><strong>{{this.degree}}</strong><br>{{this.school}}</p>
        {{/each}}
      </section>
    </main>
  </div>
</body>
</html>
```

- [ ] **Step 2: Create `cv/cv.css`**

```css
@font-face {
  font-family: "Fraunces";
  src: url("../assets/fonts/FrauncesSOFT,WONK,opsz,wght.ttf") format("truetype-variations");
  font-weight: 100 1000;
}
@font-face {
  font-family: "Inter";
  src: url("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2") format("woff2-variations");
  font-weight: 100 900;
}

:root {
  --accent: #0f6d6a;
  --ink: #1c1c1c;
  --muted: #5a5a5a;
  --rail-bg: #f0f6f5;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

@page { size: A4; margin: 0; }

body {
  width: 210mm;
  min-height: 297mm;
  display: flex;
  flex-direction: column;
  font: 9.5pt/1.45 "Inter", sans-serif;
  color: var(--ink);
  -webkit-print-color-adjust: exact;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9mm 12mm 5mm;
}
h1 {
  font-family: "Fraunces", serif;
  font-size: 24pt;
  font-weight: 560;
}
.tagline { color: var(--accent); font-size: 11pt; margin-top: 1mm; }
.photo { width: 25mm; height: 25mm; object-fit: cover; border-radius: 3mm; }

.columns { display: grid; grid-template-columns: 60mm 1fr; flex: 1; }

aside { background: var(--rail-bg); padding: 4mm 6mm 8mm 12mm; }
main { padding: 4mm 12mm 8mm 7mm; }

section { margin-bottom: 4.5mm; }

h2 {
  font-family: "Fraunces", serif;
  font-size: 10.5pt;
  font-weight: 620;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
  border-bottom: 0.4mm solid var(--accent);
  padding-bottom: 0.8mm;
  margin-bottom: 2.5mm;
}

aside h3 { font-size: 9.5pt; font-weight: 650; margin-top: 2mm; }
.skill-items { color: var(--muted); }
.cert { margin-bottom: 2mm; }

ul.contact, ul.languages { list-style: none; }
ul.contact li { margin-bottom: 1mm; overflow-wrap: anywhere; }
ul.languages li { display: flex; justify-content: space-between; margin-bottom: 1mm; }
.level { color: var(--muted); }

article { margin-bottom: 3.5mm; }
.role-line { display: flex; justify-content: space-between; align-items: baseline; }
.role-line h3 { font-size: 10.5pt; font-weight: 650; }
.dates { color: var(--muted); font-size: 8.5pt; white-space: nowrap; margin-left: 4mm; }
.company { color: var(--accent); font-size: 9pt; margin-bottom: 1mm; }
article ul { list-style: disc outside; padding-left: 4.5mm; }
article li { margin-bottom: 0.6mm; }
.edu { margin-bottom: 2mm; }
```

- [ ] **Step 3: Create `cv/data/en.json`**

```json
{
  "meta": {
    "outputFile": "Resume Ochoa.pdf",
    "lang": "en",
    "photo": false,
    "dob": false
  },
  "name": "Aurelio Ochoa Gomez",
  "title": "Software Developer & Certified UAS Pilot",
  "contact": {
    "location": "Guayaquil, Ecuador",
    "email": "aurelioochoagomez@hotmail.com",
    "phone": "+593 978 674 056",
    "linkedin": "aurelioochoa",
    "website": "aurelioochoa.github.io"
  },
  "labels": {
    "contact": "Contact",
    "profile": "Profile",
    "experience": "Experience",
    "education": "Education",
    "certifications": "Certifications",
    "skills": "Skills",
    "languages": "Languages",
    "dob": "Date of birth"
  },
  "profile": "Versatile technology professional combining full-stack web development with certified UAS operations. Three years of experience across front-end development, systems administration, and cloud infrastructure — now flying precision-agriculture drone missions while delivering freelance web and automation projects.",
  "experience": [
    {
      "role": "Agricultural Drone Pilot",
      "company": "Fumigasa",
      "location": "Ecuador",
      "dates": "May 2024 – Present",
      "bullets": [
        "Fly precision agricultural spraying missions with DJI Agras T50 and, currently, DJI Agras T100 drones.",
        "Plan and execute flight missions, including field mapping and route planning.",
        "Maintain and calibrate UAS and spraying equipment."
      ]
    },
    {
      "role": "Freelance Web Developer & Automation Engineer",
      "company": "Mediacor Plus",
      "location": "Remote",
      "dates": "2025",
      "bullets": [
        "Designed and built the company website, mediacorplus.com.",
        "Developed mail-server automations delivering subscription-based updates from the company's media monitoring services."
      ]
    },
    {
      "role": "Systems Administrator Intern",
      "company": "European University of the Atlantic",
      "location": "Santander, Spain",
      "dates": "Sep 2023 – Feb 2024",
      "bullets": [
        "Managed on-site Linux servers and databases.",
        "Maintained infrastructure and implemented automated testing and deployment with Jenkins.",
        "Built cloud infrastructure and automated deployments on Google Cloud Platform.",
        "Containerized developer projects with Docker."
      ]
    },
    {
      "role": "Front-end Web Development Intern",
      "company": "European University of the Atlantic",
      "location": "Santander, Spain",
      "dates": "Sep 2022 – Sep 2023",
      "bullets": [
        "Published, edited, and managed content for all university partners.",
        "Maintained and extended custom WordPress themes in PHP.",
        "Automated processes with Google AppScript and Gmail integration."
      ]
    },
    {
      "role": "Front-end Software Developer",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "May 2021 – May 2022",
      "bullets": [
        "Tested and debugged one of the company's main custom platforms as part of the QC team.",
        "Implemented designs and features for multiple web stores using WordPress and Elementor.",
        "Created and maintained features for the company's e-commerce platform, Publifyer."
      ]
    },
    {
      "role": "High School Professional Intern",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "Feb 2020 – Mar 2020",
      "bullets": [
        "Learned HTML, CSS, and JavaScript fundamentals by building real projects in a collaborative team."
      ]
    }
  ],
  "certifications": [
    { "name": "Certified UAS Pilot", "issuer": "DGAC Ecuador", "year": "2025" }
  ],
  "education": [
    { "degree": "High School Diploma", "school": "German Humboldt School of Guayaquil, Ecuador" }
  ],
  "skills": [
    { "group": "Web", "items": "HTML, CSS, Sass, JavaScript, React, Vue, Angular, Node.js, Express, Laravel, PHP, Bootstrap, WordPress" },
    { "group": "Systems & DevOps", "items": "Linux administration, Docker, Jenkins, Google Cloud Platform" },
    { "group": "Databases", "items": "MySQL, MongoDB" },
    { "group": "UAS", "items": "DJI Agras T50/T100, flight planning, precision spraying" },
    { "group": "Other", "items": "Python, Java, Lua, Google AppScript" }
  ],
  "languages": [
    { "name": "Spanish", "level": "Native" },
    { "name": "English", "level": "Native-level fluency" },
    { "name": "German", "level": "B2" }
  ]
}
```

- [ ] **Step 4: Smoke-test the template against the data**

Run:
```bash
cd cv && node -e "
import('node:fs/promises').then(async (fs) => {
  const { render } = await import('./render.js');
  const tpl = await fs.readFile('template.html', 'utf8');
  const data = JSON.parse(await fs.readFile('data/en.json', 'utf8'));
  const html = render(tpl, data);
  if (html.includes('{{')) throw new Error('Unrendered tokens remain');
  if (!html.includes('Fumigasa')) throw new Error('Missing expected content');
  if (html.includes('photo.jpg')) throw new Error('EN must not include the photo');
  console.log('template ok');
});
"
```
Expected: `template ok`. A missing-key error here means template and data drifted — fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add cv/template.html cv/cv.css cv/data/en.json
git commit -m "Add CV template, print stylesheet, and English data"
```

---

### Task 4: Build script → English PDF

**Files:**
- Create: `cv/build.js`
- Modify (output): `assets/pdf/Resume Ochoa.pdf` (regenerated)

**Interfaces:**
- Consumes: `render()` from `cv/render.js`; every `cv/data/*.json` (renders all of them, sorted by filename); `meta.outputFile` names the PDF.
- Produces: `npm run build` (inside `cv/`) regenerates every PDF into `assets/pdf/`. Intermediate HTML written as `cv/.build-<lang>.html` (gitignored) so relative URLs (`cv.css`, `photo.jpg`, fonts) resolve identically to the source files.

- [ ] **Step 1: Create `cv/build.js`**

```js
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { render } from './render.js';

const cvDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(cvDir, '..', 'assets', 'pdf');

const template = await readFile(path.join(cvDir, 'template.html'), 'utf8');
const dataFiles = (await readdir(path.join(cvDir, 'data')))
  .filter((f) => f.endsWith('.json'))
  .sort();
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch();
try {
  for (const file of dataFiles) {
    const data = JSON.parse(await readFile(path.join(cvDir, 'data', file), 'utf8'));
    const html = render(template, data);
    const htmlPath = path.join(cvDir, `.build-${path.basename(file, '.json')}.html`);
    await writeFile(htmlPath, html);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: path.join(outDir, data.meta.outputFile),
      format: 'A4',
      printBackground: true,
    });
    await page.close();
    console.log(`built ${data.meta.outputFile}`);
  }
} finally {
  await browser.close();
}
```

(If Task 1 Step 4 required `--no-sandbox`, use `puppeteer.launch({ args: ['--no-sandbox'] })`.)

- [ ] **Step 2: Run the build**

Run: `cd cv && npm run build`
Expected: `built Resume Ochoa.pdf`, exit 0.

- [ ] **Step 3: Verify the PDF**

Run:
```bash
pdfinfo "assets/pdf/Resume Ochoa.pdf" | grep -E "Pages|Page size"
pdftotext "assets/pdf/Resume Ochoa.pdf" - | grep -c "Fumigasa"
pdfimages -list "assets/pdf/Resume Ochoa.pdf" | wc -l
```
Expected: `Pages: 1`, `Page size: 595.x x 841.x pts (A4)`; grep count ≥ 1; pdfimages output ≤ 2 lines (header only — no embedded images in the EN version).

**If Pages is 2:** in `cv/cv.css` change `font: 9.5pt/1.45` to `font: 9pt/1.4`, `section { margin-bottom: 4.5mm }` to `3.5mm`, and `article { margin-bottom: 3.5mm }` to `2.5mm`, then rebuild and re-verify.

- [ ] **Step 4: Visual check**

Read `assets/pdf/Resume Ochoa.pdf` with the Read tool. Confirm: two-column layout, teal headings, no photo, no overflow/clipping, name in Fraunces (a serif with character, clearly not a default sans).

- [ ] **Step 5: Commit**

```bash
git add cv/build.js "assets/pdf/Resume Ochoa.pdf"
git commit -m "Add PDF build script and regenerate English resume"
```

---

### Task 5: Spanish and German CV data

**Files:**
- Create: `cv/data/es.json`
- Create: `cv/data/de.json`
- Modify (output): `assets/pdf/Curriculum Ochoa.pdf`, `assets/pdf/Lebenslauf Ochoa.pdf` (regenerated), `assets/pdf/Resume Ochoa.pdf` (rebuilt, unchanged content)

**Interfaces:**
- Consumes: the key tree defined in Task 3 (`en.json` is the reference — same structure, translated values).

- [ ] **Step 1: Create `cv/data/es.json`**

```json
{
  "meta": {
    "outputFile": "Curriculum Ochoa.pdf",
    "lang": "es",
    "photo": true,
    "dob": false
  },
  "name": "Aurelio Ochoa Gomez",
  "title": "Desarrollador de Software y Piloto de UAS Certificado",
  "contact": {
    "location": "Guayaquil, Ecuador",
    "email": "aurelioochoagomez@hotmail.com",
    "phone": "+593 978 674 056",
    "linkedin": "aurelioochoa",
    "website": "aurelioochoa.github.io"
  },
  "labels": {
    "contact": "Contacto",
    "profile": "Perfil",
    "experience": "Experiencia",
    "education": "Formación",
    "certifications": "Certificaciones",
    "skills": "Aptitudes",
    "languages": "Idiomas",
    "dob": "Fecha de nacimiento"
  },
  "profile": "Profesional de tecnología versátil que combina el desarrollo web full-stack con operaciones certificadas de drones (UAS). Tres años de experiencia en desarrollo front-end, administración de sistemas e infraestructura en la nube; actualmente vuelo misiones de agricultura de precisión mientras desarrollo proyectos freelance de web y automatización.",
  "experience": [
    {
      "role": "Piloto de Dron Agrícola",
      "company": "Fumigasa",
      "location": "Ecuador",
      "dates": "May 2024 – Actualidad",
      "bullets": [
        "Vuelo misiones de fumigación agrícola de precisión con drones DJI Agras T50 y, actualmente, DJI Agras T100.",
        "Planifico y ejecuto misiones de vuelo, incluyendo mapeo de campos y planificación de rutas.",
        "Mantengo y calibro los UAS y el equipo de fumigación."
      ]
    },
    {
      "role": "Desarrollador Web y de Automatizaciones Freelance",
      "company": "Mediacor Plus",
      "location": "Remoto",
      "dates": "2025",
      "bullets": [
        "Diseñé y construí el sitio web de la empresa, mediacorplus.com.",
        "Desarrollé automatizaciones de servidor de correo que envían actualizaciones por suscripción de sus servicios de monitoreo de medios."
      ]
    },
    {
      "role": "Becario en Administración de Sistemas",
      "company": "Universidad Europea del Atlántico",
      "location": "Santander, España",
      "dates": "Sep 2023 – Feb 2024",
      "bullets": [
        "Gestión de servidores Linux y bases de datos en sitio.",
        "Mantenimiento de infraestructura e implementación de pruebas y despliegues automatizados con Jenkins.",
        "Creación de infraestructura en la nube y despliegues automatizados en Google Cloud Platform.",
        "Contenerización de los proyectos de los desarrolladores con Docker."
      ]
    },
    {
      "role": "Becario en Desarrollo Web Front-end",
      "company": "Universidad Europea del Atlántico",
      "location": "Santander, España",
      "dates": "Sep 2022 – Sep 2023",
      "bullets": [
        "Publicación, edición y gestión de contenido para todos los socios universitarios.",
        "Mantenimiento y ampliación de temas personalizados de WordPress en PHP.",
        "Automatización de procesos con Google AppScript e integración con Gmail."
      ]
    },
    {
      "role": "Desarrollador de Software Front-end",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "May 2021 – May 2022",
      "bullets": [
        "Probé y depuré una de las principales plataformas personalizadas de la empresa como parte del equipo de control de calidad.",
        "Implementé diseños y funciones para múltiples tiendas web con WordPress y Elementor.",
        "Creé y mantuve funciones para la plataforma de comercio electrónico de la empresa, Publifyer."
      ]
    },
    {
      "role": "Prácticas Profesionales de Secundaria",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "Feb 2020 – Mar 2020",
      "bullets": [
        "Aprendí los fundamentos de HTML, CSS y JavaScript construyendo proyectos reales en un equipo colaborativo."
      ]
    }
  ],
  "certifications": [
    { "name": "Piloto de UAS Certificado", "issuer": "DGAC Ecuador", "year": "2025" }
  ],
  "education": [
    { "degree": "Bachillerato", "school": "Colegio Alemán Humboldt de Guayaquil, Ecuador" }
  ],
  "skills": [
    { "group": "Web", "items": "HTML, CSS, Sass, JavaScript, React, Vue, Angular, Node.js, Express, Laravel, PHP, Bootstrap, WordPress" },
    { "group": "Sistemas y DevOps", "items": "Administración de Linux, Docker, Jenkins, Google Cloud Platform" },
    { "group": "Bases de datos", "items": "MySQL, MongoDB" },
    { "group": "UAS", "items": "DJI Agras T50/T100, planificación de vuelo, fumigación de precisión" },
    { "group": "Otros", "items": "Python, Java, Lua, Google AppScript" }
  ],
  "languages": [
    { "name": "Español", "level": "Nativo" },
    { "name": "Inglés", "level": "Nivel nativo" },
    { "name": "Alemán", "level": "B2" }
  ]
}
```

- [ ] **Step 2: Create `cv/data/de.json`**

```json
{
  "meta": {
    "outputFile": "Lebenslauf Ochoa.pdf",
    "lang": "de",
    "photo": true,
    "dob": "14.05.2002"
  },
  "name": "Aurelio Ochoa Gomez",
  "title": "Softwareentwickler & zertifizierter UAS-Pilot",
  "contact": {
    "location": "Guayaquil, Ecuador",
    "email": "aurelioochoagomez@hotmail.com",
    "phone": "+593 978 674 056",
    "linkedin": "aurelioochoa",
    "website": "aurelioochoa.github.io"
  },
  "labels": {
    "contact": "Kontakt",
    "profile": "Profil",
    "experience": "Berufserfahrung",
    "education": "Ausbildung",
    "certifications": "Zertifikate",
    "skills": "Kenntnisse",
    "languages": "Sprachen",
    "dob": "Geburtsdatum"
  },
  "profile": "Vielseitiger Technologie-Profi, der Full-Stack-Webentwicklung mit zertifiziertem Drohnenbetrieb (UAS) verbindet. Drei Jahre Erfahrung in Frontend-Entwicklung, Systemadministration und Cloud-Infrastruktur; derzeit Präzisionslandwirtschafts-Flugeinsätze sowie freiberufliche Web- und Automatisierungsprojekte.",
  "experience": [
    {
      "role": "Agrardrohnen-Pilot",
      "company": "Fumigasa",
      "location": "Ecuador",
      "dates": "Mai 2024 – heute",
      "bullets": [
        "Präzise landwirtschaftliche Sprühflüge mit DJI Agras T50 und aktuell DJI Agras T100.",
        "Flugplanung und Missionsdurchführung, einschließlich Feldkartierung und Routenplanung.",
        "Wartung und Kalibrierung der UAS und der Sprühausrüstung."
      ]
    },
    {
      "role": "Freiberuflicher Web- & Automatisierungsentwickler",
      "company": "Mediacor Plus",
      "location": "Remote",
      "dates": "2025",
      "bullets": [
        "Konzeption und Entwicklung der Unternehmenswebsite mediacorplus.com.",
        "Entwicklung von Mailserver-Automatisierungen für abonnementbasierte Updates der Medienbeobachtungsdienste."
      ]
    },
    {
      "role": "Praktikant Systemadministration",
      "company": "Universidad Europea del Atlántico",
      "location": "Santander, Spanien",
      "dates": "Sep 2023 – Feb 2024",
      "bullets": [
        "Verwaltung von Linux-Servern und Datenbanken vor Ort.",
        "Wartung der Infrastruktur sowie automatisierte Tests und Deployments mit Jenkins.",
        "Aufbau von Cloud-Infrastruktur und automatisierten Deployments auf der Google Cloud Platform.",
        "Containerisierung der Entwicklerprojekte mit Docker."
      ]
    },
    {
      "role": "Praktikant Frontend-Webentwicklung",
      "company": "Universidad Europea del Atlántico",
      "location": "Santander, Spanien",
      "dates": "Sep 2022 – Sep 2023",
      "bullets": [
        "Veröffentlichung, Bearbeitung und Verwaltung von Inhalten für alle Universitätspartner.",
        "Wartung und Erweiterung individueller WordPress-Themes in PHP.",
        "Prozessautomatisierung mit Google AppScript und Gmail-Integration."
      ]
    },
    {
      "role": "Frontend-Softwareentwickler",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "Mai 2021 – Mai 2022",
      "bullets": [
        "Testen und Debuggen einer der wichtigsten unternehmenseigenen Plattformen im Qualitätssicherungsteam.",
        "Umsetzung von Designs und Funktionen für mehrere Webshops mit WordPress und Elementor.",
        "Entwicklung und Pflege von Funktionen für die E-Commerce-Plattform Publifyer."
      ]
    },
    {
      "role": "Schülerpraktikum",
      "company": "Just Click Media",
      "location": "Guayaquil, Ecuador",
      "dates": "Feb 2020 – Mär 2020",
      "bullets": [
        "Grundlagen von HTML, CSS und JavaScript durch reale Projekte im Team erlernt."
      ]
    }
  ],
  "certifications": [
    { "name": "Zertifizierter UAS-Pilot", "issuer": "DGAC Ecuador", "year": "2025" }
  ],
  "education": [
    { "degree": "Schulabschluss (Bachillerato)", "school": "Deutsche Schule Humboldt Guayaquil, Ecuador" }
  ],
  "skills": [
    { "group": "Web", "items": "HTML, CSS, Sass, JavaScript, React, Vue, Angular, Node.js, Express, Laravel, PHP, Bootstrap, WordPress" },
    { "group": "Systeme & DevOps", "items": "Linux-Administration, Docker, Jenkins, Google Cloud Platform" },
    { "group": "Datenbanken", "items": "MySQL, MongoDB" },
    { "group": "UAS", "items": "DJI Agras T50/T100, Flugplanung, Präzisionssprühen" },
    { "group": "Weitere", "items": "Python, Java, Lua, Google AppScript" }
  ],
  "languages": [
    { "name": "Spanisch", "level": "Muttersprache" },
    { "name": "Englisch", "level": "Verhandlungssicher" },
    { "name": "Deutsch", "level": "B2" }
  ]
}
```

- [ ] **Step 3: Build all three**

Run: `cd cv && npm run build`
Expected: three `built ...` lines, exit 0.

- [ ] **Step 4: Verify all three PDFs**

Run:
```bash
for f in "Resume Ochoa" "Curriculum Ochoa" "Lebenslauf Ochoa"; do
  echo "== $f =="
  pdfinfo "assets/pdf/$f.pdf" | grep Pages
done
pdftotext "assets/pdf/Curriculum Ochoa.pdf" - | grep -c "Fumigasa"
pdftotext "assets/pdf/Lebenslauf Ochoa.pdf" - | grep -c "Agrardrohnen"
pdfimages -list "assets/pdf/Curriculum Ochoa.pdf" | grep -c jpeg
pdfimages -list "assets/pdf/Lebenslauf Ochoa.pdf" | grep -c jpeg
```
Expected: `Pages: 1` for all three; both grep counts ≥ 1; both jpeg counts ≥ 1 (the photo). Apply the same overflow contingency as Task 4 Step 3 if any report 2 pages.

- [ ] **Step 5: Visual check**

Read `assets/pdf/Curriculum Ochoa.pdf` and `assets/pdf/Lebenslauf Ochoa.pdf` with the Read tool. Confirm the photo renders top-right, accents/umlauts display correctly (á, ñ, ü, ß), and the German version shows the Geburtsdatum line.

- [ ] **Step 6: Commit**

```bash
git add cv/data/es.json cv/data/de.json assets/pdf/*.pdf
git commit -m "Add Spanish and German CV data and regenerate all PDFs"
```

---

### Task 6: Rename and extend the site language JSONs

**Files:**
- Rename: `assets/lenguages/enligsh.json` → `assets/languages/en.json`
- Rename: `assets/lenguages/spanish.json` → `assets/languages/es.json`
- Rename: `assets/lenguages/german.json` → `assets/languages/de.json`
- Test: `cv/languages.test.js`

**Interfaces:**
- Consumes: nothing (these files are referenced by no code yet — verified during planning).
- Produces: `assets/languages/{en,es,de}.json`, each with the existing keys **plus** `socialMediaSection.cvFile` (string), `contactSection.form.{name,email,message,send}` (strings), and `experienceSection.experiences` extended from 4 to 6 entries. Consumed by `i18n.js` (Task 7).

- [ ] **Step 1: Rename via git**

```bash
git mv assets/lenguages assets/languages
git mv assets/languages/enligsh.json assets/languages/en.json
git mv assets/languages/spanish.json assets/languages/es.json
git mv assets/languages/german.json assets/languages/de.json
```

- [ ] **Step 2: Add the new keys and experience entries**

In `assets/languages/en.json`:
- Inside `socialMediaSection`, add: `"cvFile": "Resume Ochoa.pdf"`
- Inside `contactSection`, add:
```json
"form": { "name": "Name", "email": "Email", "message": "Message", "send": "Send" }
```
- Append to `experienceSection.experiences` (after the 4 existing entries):
```json
{
  "title": "Agricultural Drone Pilot",
  "subtitle": "Fumigasa · Full-time",
  "dateRange": "May 2024 - Present",
  "duration": "2+ years",
  "description": "Precision agricultural spraying missions piloting DJI Agras T50 and currently DJI Agras T100 drones. Flight planning, mission execution, and equipment maintenance and calibration."
},
{
  "title": "Freelance Web & Automation Developer",
  "subtitle": "Mediacor Plus · Commission",
  "dateRange": "2025",
  "duration": "",
  "description": "Built the company website (mediacorplus.com) and developed mail-server automations delivering subscription-based updates from its media monitoring services."
}
```

In `assets/languages/es.json`:
- `socialMediaSection`: `"cvFile": "Curriculum Ochoa.pdf"`
- `contactSection`:
```json
"form": { "name": "Nombre", "email": "Correo electrónico", "message": "Mensaje", "send": "Enviar" }
```
- Append to `experienceSection.experiences`:
```json
{
  "title": "Piloto de Dron Agrícola",
  "subtitle": "Fumigasa · Tiempo completo",
  "dateRange": "May 2024 - Actualidad",
  "duration": "2+ años",
  "description": "Misiones de fumigación agrícola de precisión pilotando drones DJI Agras T50 y actualmente DJI Agras T100. Planificación de vuelos, ejecución de misiones y mantenimiento y calibración de equipos."
},
{
  "title": "Desarrollador Web y de Automatizaciones Freelance",
  "subtitle": "Mediacor Plus · Por comisión",
  "dateRange": "2025",
  "duration": "",
  "description": "Construí el sitio web de la empresa (mediacorplus.com) y desarrollé automatizaciones de servidor de correo que envían actualizaciones por suscripción de sus servicios de monitoreo de medios."
}
```

In `assets/languages/de.json`:
- `socialMediaSection`: `"cvFile": "Lebenslauf Ochoa.pdf"`
- `contactSection`:
```json
"form": { "name": "Name", "email": "E-Mail", "message": "Nachricht", "send": "Senden" }
```
- Append to `experienceSection.experiences`:
```json
{
  "title": "Agrardrohnen-Pilot",
  "subtitle": "Fumigasa · Vollzeit",
  "dateRange": "Mai 2024 - heute",
  "duration": "über 2 Jahre",
  "description": "Präzise landwirtschaftliche Sprühflüge mit DJI Agras T50 und aktuell DJI Agras T100. Flugplanung, Missionsdurchführung sowie Wartung und Kalibrierung der Geräte."
},
{
  "title": "Freiberuflicher Web- & Automatisierungsentwickler",
  "subtitle": "Mediacor Plus · Auftragsarbeit",
  "dateRange": "2025",
  "duration": "",
  "description": "Entwicklung der Unternehmenswebsite (mediacorplus.com) sowie Mailserver-Automatisierungen für abonnementbasierte Updates der Medienbeobachtungsdienste."
}
```

- [ ] **Step 3: Write the structure test — `cv/languages.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dir = new URL('../assets/languages/', import.meta.url);

function keyShape(value) {
  if (Array.isArray(value)) return value.map(keyShape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, keyShape(value[k])]));
  }
  return typeof value;
}

const files = await Promise.all(
  ['en.json', 'es.json', 'de.json'].map(async (f) => [f, JSON.parse(await readFile(new URL(f, dir), 'utf8'))])
);

test('all language files share an identical key structure', () => {
  const [, reference] = files[0];
  for (const [name, data] of files.slice(1)) {
    assert.deepEqual(keyShape(data), keyShape(reference), `${name} structure differs from en.json`);
  }
});

test('each language has 6 experiences, a cvFile, and form labels', () => {
  for (const [name, data] of files) {
    assert.equal(data.experienceSection.experiences.length, 6, name);
    assert.match(data.socialMediaSection.cvFile, /\.pdf$/, name);
    for (const key of ['name', 'email', 'message', 'send']) {
      assert.equal(typeof data.contactSection.form[key], 'string', `${name} form.${key}`);
    }
  }
});
```

- [ ] **Step 4: Run the test**

Run: `cd cv && node --test languages.test.js`
Expected: 2 pass, 0 fail. (Run it before making the Step 2 edits if you want to see it fail on the 4-entry originals.)

- [ ] **Step 5: Commit**

```bash
git add -A assets/languages cv/languages.test.js
git commit -m "Rename language JSONs and add CV links, form labels, new experiences"
```

---

### Task 7: Language switcher module and site wiring

**Files:**
- Create: `i18n.js`
- Modify: `script.js:153-155` (the init calls at the bottom)
- Modify: `index.html:29-32` (fix anchor nesting; the CV link keeps its English default for no-JS visitors)
- Modify: `styles/index.css` (append toggle styles)

**Interfaces:**
- Consumes: `assets/languages/{en,es,de}.json` (Task 6 shape).
- Produces: `detectLanguage(): string`, `applyLanguage(lang: string): Promise<void>`, `buildToggle(current: string): void` — imported by `script.js`. `localStorage` key: `"lang"`, values `"en" | "es" | "de"`.

- [ ] **Step 1: Fix the malformed anchors in `index.html`**

Replace lines 29–32:

```html
                <a href="https://aurelioochoa.xyz" target="_blank"><i title="aurelioochoa.xyz" class="fa-solid fa-globe"></i>
                <!-- <a href="/assets/aurelioochoaCV.pdf" download="aurelioochoaCV"><i title="CV" class="fa-solid fa-file-pdf"></i></a> -->
                <a href="/assets/pdf/Resume Ochoa.pdf" target="_blank"><i title="CV" class="fa-solid fa-file-pdf"></i></a>
                </a>
```

with:

```html
                <a href="https://aurelioochoa.xyz" target="_blank"><i title="aurelioochoa.xyz" class="fa-solid fa-globe"></i></a>
                <a class="cv-link" href="assets/pdf/Resume Ochoa.pdf" target="_blank"><i title="CV" class="fa-solid fa-file-pdf"></i></a>
```

- [ ] **Step 2: Create `i18n.js`**

```js
const SUPPORTED = ['en', 'es', 'de'];

export function detectLanguage() {
  const stored = localStorage.getItem('lang');
  if (SUPPORTED.includes(stored)) return stored;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'en';
}

export async function applyLanguage(lang) {
  const res = await fetch(`assets/languages/${lang}.json`);
  if (!res.ok) throw new Error(`Failed to load language file: ${lang}`);
  const t = await res.json();

  document.documentElement.lang = lang;
  document.title = t.pageTitle;

  document.querySelector('.hero h1').textContent = t.heroSection.title;
  document.querySelector('.hero h2').textContent = t.heroSection.subtitle;

  document.querySelector('.social-media .bento-title').textContent = t.socialMediaSection.title;
  document.querySelector('.cv-link').href = `assets/pdf/${encodeURIComponent(t.socialMediaSection.cvFile)}`;

  document.querySelector('.timeline .bento-title').textContent = t.experienceSection.title;
  const timeline = document.querySelector('.timeline');
  timeline.querySelectorAll('template').forEach((tpl) => tpl.remove());
  t.experienceSection.experiences.forEach((exp, i) => {
    const tpl = document.createElement('template');
    tpl.setAttribute('data-order', String(i + 1));
    tpl.setAttribute('title', exp.title);
    tpl.setAttribute('data-subtitle', exp.subtitle);
    const duration = exp.duration ? ` · ${exp.duration}` : '';
    tpl.innerHTML = `${exp.dateRange}${duration} <br> ${exp.description}`;
    timeline.appendChild(tpl);
  });

  document.querySelector('.icon-shelf .bento-title').textContent = t.technologiesSection.title;
  const icons = document.querySelectorAll('.icon-shelf i[title]');
  t.technologiesSection.technologies.forEach((tech, i) => {
    const icon = icons[i];
    if (!icon) return;
    icon.setAttribute('title', tech.title);
    icon.querySelector('template').innerHTML = tech.description;
  });

  document.querySelector('.contact h1').innerHTML =
    `<i class="fa-solid fa-handshake"></i>${t.contactSection.title}`;
  document.querySelector('.contact input[name="Name"]').placeholder = t.contactSection.form.name;
  document.querySelector('.contact input[name="Email"]').placeholder = t.contactSection.form.email;
  document.querySelector('.contact textarea').placeholder = t.contactSection.form.message;
  document.querySelector('.contact button').textContent = t.contactSection.form.send;

  document.querySelector('footer > p').innerHTML =
    `${t.footerSection.website} <a href="https://aurelioochoa.xyz" target="_blank">aurelioochoa.xyz</a>`;
}

export function buildToggle(current) {
  const nav = document.createElement('nav');
  nav.className = 'lang-toggle';
  for (const lang of SUPPORTED) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.toUpperCase();
    if (lang === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (lang === current) return;
      localStorage.setItem('lang', lang);
      location.reload();
    });
    nav.appendChild(btn);
  }
  document.body.appendChild(nav);
}
```

- [ ] **Step 3: Wire it into `script.js`**

Replace the last three lines (`getUselessFact(); iconShelfModal(); timeline();`) with:

```js
import { detectLanguage, applyLanguage, buildToggle } from './i18n.js';

async function main() {
  const lang = detectLanguage();
  try {
    await applyLanguage(lang);
  } catch (err) {
    console.error(err); // fall back to the static English markup
  }
  buildToggle(lang);
  getUselessFact();
  iconShelfModal();
  timeline();
}
main();
```

Move the `import` line to the top of `script.js` (imports must be top-level). Note `applyLanguage` MUST resolve before `timeline()`/`iconShelfModal()` run, because both read the `<template>` elements once at init.

- [ ] **Step 4: Append toggle styles to `styles/index.css`**

```css
.lang-toggle {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  gap: 0.25rem;
}
.lang-toggle button {
  font: inherit;
  padding: 0.25rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.35rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.6;
}
.lang-toggle button.active {
  opacity: 1;
  font-weight: 700;
}
```

- [ ] **Step 5: Manual smoke check**

Run: `python3 -m http.server 8123` (in the repo root, background) and open `http://localhost:8123` — or verify via the Task 8 test if working non-interactively. Check: EN·ES·DE toggle appears top-right; clicking ES swaps hero subtitle to "Desarrollador Full-Stack" and the CV icon links to `Curriculum Ochoa.pdf`; the Experience carousel shows 6 entries including Fumigasa. Kill the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add i18n.js script.js index.html styles/index.css
git commit -m "Add language switcher with auto-detection and language-aware CV link"
```

---

### Task 8: End-to-end site test

**Files:**
- Create: `cv/site.e2e.js`

**Interfaces:**
- Consumes: the running site on `http://localhost:8123` and Puppeteer from `cv/node_modules`. Not part of `npm test` (needs a server); run explicitly.

- [ ] **Step 1: Create `cv/site.e2e.js`**

```js
// E2E check of the language switcher. Requires a static server:
//   python3 -m http.server 8123   (from the repo root)
// Run with: node site.e2e.js
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = 'http://localhost:8123';
const browser = await puppeteer.launch();

try {
  const page = await browser.newPage();

  // 1. Spanish browser auto-detects Spanish
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'es-EC' });
  });
  await page.goto(base, { waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('.hero h2', (el) => el.textContent),
    'Desarrollador Full-Stack',
    'auto-detected Spanish subtitle'
  );
  assert.match(
    await page.$eval('.cv-link', (el) => el.getAttribute('href')),
    /Curriculum/,
    'CV link follows Spanish'
  );

  // 2. Toggle to German reloads and persists
  await page.evaluate(() => {
    [...document.querySelectorAll('.lang-toggle button')]
      .find((b) => b.textContent === 'DE')
      .click();
  });
  await page.waitForFunction(
    () => document.querySelector('.hero h2')?.textContent === 'Full-Stack Entwickler'
  );
  assert.match(
    await page.$eval('.cv-link', (el) => el.getAttribute('href')),
    /Lebenslauf/,
    'CV link follows German'
  );
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('.hero h2', (el) => el.textContent),
    'Full-Stack Entwickler',
    'German persists across reloads via localStorage'
  );

  // 3. Six experience templates present
  assert.equal(
    await page.$$eval('.timeline template', (els) => els.length),
    6,
    'six experience entries'
  );

  console.log('site i18n e2e: all assertions passed');
} finally {
  await browser.close();
}
```

(Use the same `--no-sandbox` args as `build.js` if Task 1 required them.)

- [ ] **Step 2: Run it**

```bash
python3 -m http.server 8123 & SERVER_PID=$!
sleep 1
(cd cv && node site.e2e.js); STATUS=$?
kill $SERVER_PID
exit $STATUS
```
Expected: `site i18n e2e: all assertions passed`, exit 0.

- [ ] **Step 3: Full regression — renderer, structure, build**

Run: `cd cv && node --test && npm run build`
Expected: all tests pass; three PDFs rebuild successfully.

- [ ] **Step 4: Commit**

```bash
git add cv/site.e2e.js
git commit -m "Add end-to-end test for the language switcher"
```
