# CV / Resume Redesign — Design Spec

**Date:** 2026-07-10
**Status:** Approved

## Goal

Replace the two outdated binary-only PDFs in `assets/pdf/` with three redesigned,
content-updated CVs (English, Spanish, German) built from version-controlled
source in the repo, and make the website's PDF link language-aware.

## Deliverables

| File (output → `assets/pdf/`) | Language | Photo |
|---|---|---|
| `Resume Ochoa.pdf` | English | No |
| `Curriculum Ochoa.pdf` | Spanish | Yes |
| `Lebenslauf Ochoa.pdf` | German | Yes |

All three share one layout and identical content, translated.

## Content

**Positioning:** balanced hybrid — versatile tech professional spanning software
development and UAS (drone) operations.

- **Header:** Aurelio Ochoa Gomez · title line "Software Developer & Certified
  UAS Pilot" · Guayaquil, Ecuador · aurelioochoagomez@hotmail.com ·
  +593 978 674 056 · LinkedIn: aurelioochoa · aurelioochoa.github.io.
  Date of birth is dropped on EN and ES; kept on DE (local convention).
- **Profile:** 2–3 line summary of the hybrid profile.
- **Experience** (newest first):
  1. **Agricultural Drone Pilot — Fumigasa**, Ecuador · May 2024 – Present.
     Precision agricultural spraying operations piloting DJI Agras T50 and
     currently DJI Agras T100; flight planning and mission execution;
     equipment maintenance and calibration.
  2. **Freelance Web Developer & Automation Engineer — Mediacor Plus**
     (mediacorplus.com) · 2025, commissioned work alongside Fumigasa. Built
     the company website; built mail-server automations delivering
     subscription-based updates from their media monitoring services.
  3. **Systems Administrator Intern — European University of the Atlantic**,
     Santander, Spain · Sep 2023 – Feb 2024 (bullets kept from old CV).
  4. **Front-end Web Application Development Intern — European University of
     the Atlantic**, Santander, Spain · Sep 2022 – Sep 2023 (kept).
  5. **Front-end Software Developer — Just Click Media**, Guayaquil, Ecuador ·
     May 2021 – May 2022 (kept).
  6. **High School Professional Internship — Just Click Media** ·
     Feb 2020 – Mar 2020 (kept, compressed).
- **Certifications:** Certified UAS Pilot — DGAC Ecuador, 2025.
- **Education:** High School Diploma — German Humboldt School of Guayaquil.
- **Skills**, grouped: Web (HTML, CSS, Sass, JavaScript, React, Vue, Angular,
  Node.js, Express, Laravel, PHP, Bootstrap, WordPress) · Systems & DevOps
  (Linux administration, Docker, Jenkins, Google Cloud Platform) · Databases
  (MySQL, MongoDB) · Other (Python, Java, Lua, AppScript) · UAS operations
  (DJI Agras T50/T100, flight planning, precision spraying).
- **Languages:** Spanish (native), English (native-level fluency), German (B2).

## Visual design

- A4, aiming for one page; two-column body: narrow left rail (contact, skills,
  certifications, languages), wide right column (profile, experience,
  education). Full-width name header; photo top-right on ES/DE.
- Accent color: deep teal/petrol. All body text dark-gray/black on white.
- Fonts: Fraunces (already in `assets/fonts/`) for name and section headings;
  Inter (or similar clean sans, bundled locally) for body text.
- Real selectable text throughout — ATS-parseable, no text baked into images.

## Architecture (Approach A: HTML/CSS + Puppeteer)

```
cv/
  template.html        one layout for all languages (placeholder tokens)
  cv.css               print-oriented stylesheet (@page A4)
  data/en.json         content per language, mirroring the site's
  data/es.json         assets/lenguages/ i18n pattern
  data/de.json
  photo.jpg            used by ES/DE builds
  build.js             Node script: inject data → headless Chrome → PDF ×3
  package.json         puppeteer dependency
```

`node build.js` writes the three PDFs into `assets/pdf/`, overwriting the old
ones. `cv/node_modules` is gitignored.

## Website integration: language switcher

Investigation found the JSONs in `assets/lenguages/` are not wired into the
site at all — there is no language switcher. User chose to build one as part
of this project:

- Rename `assets/lenguages/` → `assets/languages/` and the files to
  `en.json`, `es.json`, `de.json` (nothing references them yet; also fixes the
  "enligsh" typo).
- On load: use `localStorage.lang` if valid, else the browser language
  (`navigator.language` prefix-matched against en/es/de), else `en`.
- A new `i18n.js` module fetches the JSON and applies it to the DOM **before**
  the timeline/modal init in `script.js`: page title, `<html lang>`, hero,
  section titles, timeline experience templates (rebuilt from JSON),
  technology descriptions, contact form placeholders, footer, and the CV
  link's `href` (new `socialMediaSection.cvFile` key per language).
- A fixed EN·ES·DE toggle (top-right); clicking stores the choice in
  `localStorage` and reloads the page.
- The language JSONs gain the two new experience entries (Fumigasa, Mediacor
  Plus) and new keys: `socialMediaSection.cvFile`,
  `contactSection.form{name,email,message,send}`.
- The malformed anchor nesting in `index.html` (globe link never closed,
  CV link nested inside) gets fixed while touching that markup.
- Testing: a Puppeteer script against a local static server asserts
  auto-detection, toggle switching, persistence, and the language-aware CV
  link.

## Error handling / testing

- `build.js` fails loudly if a data file is missing a key used by the template.
- Visual check: render each PDF and inspect (one page, no overflow, photo
  present only on ES/DE).
- Text check: extract text from each generated PDF to confirm real text layer.
- Site check: switch languages locally and confirm the PDF link follows.

## Resolved details

1. Fumigasa: May 2024 – Present.
2. Mediacor Plus: 2025, commissioned work.
3. UAS licence: DGAC Ecuador, 2025.
4. Photo for ES/DE: extract the photo embedded in the old
   `Curriculum Ochoa.pdf` and save it as `cv/photo.jpg`.

## Out of scope

- Redesigning the website itself.
- German translation review by a native speaker (user has B2 and can proofread).
