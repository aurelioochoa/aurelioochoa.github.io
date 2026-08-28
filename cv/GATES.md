# GATES: replace the CV with the new design

Scope: `cv/` only. The old template, stylesheet, fonts and data are replaced by the
new "CV Aurelio Ochoa" design. The 3-language build (es/en/de → assets/pdf) is kept.

OWNS: cv/template.html cv/cv.css cv/fonts cv/photo.png cv/data cv/render.js cv/package.json assets/pdf

- [x] G1 The renderer supports the block forms the new template uses, and its unit tests pass.
      CHECK: cd cv && node --test render.test.js
      EXPECT: # fail 0
- [x] G2 No reference to the discarded design survives in cv/ (Fraunces, Inter, @fontsource, old class names).
      CHECK: node cv/scripts/gate-no-old-design.mjs
      EXPECT: NO_OLD_DESIGN_OK
- [x] G3 All three data files render against the new template with no missing-key error.
      CHECK: node cv/scripts/gate-render-all.mjs
      EXPECT: RENDER_ALL_OK
- [x] G4 The build produces all three PDFs, each exactly one A4 page.
      CHECK: cd cv && npm run build && node scripts/gate-pdf-pages.mjs
      EXPECT: PDF_PAGES_OK
- [x] G5 Every embedded font the stylesheet declares resolves to a file on disk.
      CHECK: node cv/scripts/gate-fonts-exist.mjs
      EXPECT: FONTS_OK
- [x] G6 The rendered page visually matches the source design (manual, screenshot diff).
      MANUAL: compared lab/render-{es,en,de}.png against the source PDF page 1.
      EVIDENCE: es/en match the source layout element for element. de needed two
      fixes found this way, both fixed and re-shot: a sixth contact chip stranded a
      "·" at the right edge (moved the date of birth to its own line), and the page
      ran 3.4mm long (added the .compact density, PDF now one page).
