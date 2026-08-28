# aurelioochoa.github.io

Personal site for Aurelio Ochoa: software developer, certified agricultural drone pilot,
trained cook. <https://aurelioochoa.github.io>

No build step. The site is plain HTML, CSS and ES modules, served by GitHub Pages exactly as
it sits in this repo. Fonts, imagery and the WebGL scene are all self-hosted; nothing is
fetched from a CDN at render time.

```
index.html            fourteen acts, hard cuts between three worlds
styles/site.css       one stylesheet, tokens documented in DESIGN.md
js/main.js            language switch, act reveals, drone wiring
js/i18n.js            data-i18n driven translation
js/drone.js           the WebGL quadcopter, written against raw WebGL
assets/languages/     en, es, de
assets/img/           generated placeholders, each marked with data-replace
cv/                   the CV builder: data in, three PDFs out
tools/                the acceptance gates
```

`DESIGN.md` is the design language: colour, type, shape, motion, and the bans. Read it before
changing anything visual.

## The imagery is placeholder

Every file in `assets/img/` is a generated stand-in for a real photo. Each slot in the markup
carries a `data-replace` attribute naming what belongs there, so a real photograph can be
dropped in without touching the layout:

```html
<img src="assets/img/world-sky.webp" data-replace="his own aerial footage still from a real spray mission">
```

## Working on it

```bash
make            # what you can run
make serve      # http://localhost:8000
make check      # every gate, site and CV. add -j4 and it takes 12s instead of 27s
```

The gates, each runnable on its own as `make gate-<name>`:

| Gate | What it holds |
|---|---|
| `old-site-gone` | no residue from the previous design |
| `links-resolve` | every referenced asset exists |
| `i18n-complete` | all three languages complete, and actually translated |
| `e2e` | the language switcher: detection, toggle, persistence, CV link |
| `tells` | no em-dash, no scroll cue, no act counters, eyebrow budget |
| `drone` | WebGL renders, hands over, degrades without WebGL or with reduced motion |
| `shoot` | scroll walk at desktop and phone, writes `lab/site/` |
| `reveal` | entrances complete on their own, nothing forced |

The browser gates borrow the Puppeteer already installed under `cv/`; `make install` puts it
there if it is missing.

## The CV

`cv/` renders three language variants of one résumé to PDF.

```bash
make cv         # rebuilds assets/pdf/*.pdf, but only if the sources changed
make check-cv   # the renderer tests plus four gates, including one page per PDF
make shots-cv   # renders each language to cv/lab/ to look at
```

Edit `cv/data/{en,es,de}.json` and rebuild. The renderer throws on a missing key, so a data
file that drifts from the template fails the build instead of printing a blank.

## Credits

jazzskull by [Cathy Jarboe](https://www.cathyjarboe.com/).
