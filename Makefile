# aurelioochoa.github.io
#
# The site itself has no build step: it is served exactly as it sits in the repo. This file
# exists for the two things that are not just "open index.html": running the acceptance
# gates, and rendering the CV to PDF.
#
#   make            what you can run
#   make serve      serve the site locally
#   make check      every gate, site and CV  (add -j4: 27s becomes 12s)
#   make cv         rebuild the three PDFs

SHELL := /bin/bash
# Every gate recipe pipes into tail to keep the output to one line. Without pipefail the
# pipeline reports tail's status, so a FAILING gate would still exit 0 and a broken build
# would look green. This one line is what makes `make check` trustworthy.
.SHELLFLAGS := -o pipefail -c
.DEFAULT_GOAL := help

# The gates are independent and each binds its own port, so `make -j` works. Without this
# their output would interleave mid-line; with it each target's lines arrive together.
MAKEFLAGS += --output-sync=target

PORT ?= 8000
NODE ?= node
NPM  ?= npm

# The browser gates borrow the Puppeteer already installed under cv/, so there is one
# node_modules in this repo and nothing to install at the root.
PUPPETEER := cv/node_modules/puppeteer

SITE_GATES := old-site-gone links-resolve i18n-complete tells drone e2e shoot no-network section-effects
CV_GATES   := no-old-design render-all fonts-exist pdf-pages

# The three PDFs have spaces in their names, which Make cannot carry through a target list
# reliably, and one puppeteer run emits all three together anyway. A stamp file stands in
# for the set: it is the honest way to express "these outputs, from this one command".
CV_STAMP   := cv/.pdfs.stamp
CV_SOURCES := $(wildcard cv/data/*.json) cv/template.html cv/cv.css cv/render.js cv/build.js cv/photo.png

.PHONY: help serve check check-site check-cv cv cv-test shots shots-cv \
        install install-site scenes fonts clean clean-lab $(addprefix gate-,$(SITE_GATES)) \
        reveal spray

help:
	@echo "aurelioochoa.github.io"
	@echo
	@echo "  make serve        serve the site at http://localhost:$(PORT)"
	@echo "  make check        run every gate, site and CV  (add -j4 to parallelise)"
	@echo "  make check-site   the site gates plus the reveal check"
	@echo "  make scenes       rebuild the ThreeUI scenes and the bundle they need"
	@echo "  make fonts        re-subset the web fonts from assets/fonts/*.ttf"
	@echo "  make check-cv     the CV renderer tests and its four gates"
	@echo "  make cv           rebuild the three PDFs (only if the sources changed)"
	@echo "  make shots        contact sheets of every act, into lab/site/"
	@echo "  make shots-cv     render each CV language to lab/, into cv/lab/"
	@echo "  make install      install the CV builder's dependencies"
	@echo "  make install-site install the scene builder's dependencies"
	@echo "  make clean        remove generated screenshots and build leftovers"
	@echo
	@echo "  individual gates:"
	@$(foreach g,$(SITE_GATES),echo "    make gate-$(g)";)
	@echo "    make reveal"
	@echo "    make spray"

# ---------------------------------------------------------------- serving

serve:
	@echo "serving on http://localhost:$(PORT)  (ctrl-c to stop)"
	@python3 -m http.server $(PORT)

# ---------------------------------------------------------------- gates

# The browser gates need Puppeteer. Order-only, so a newer node_modules mtime does not
# force every gate to re-run.
$(PUPPETEER):
	@$(MAKE) --no-print-directory install

install:
	@echo "installing the CV builder's dependencies"
	@cd cv && $(NPM) install

install-site:
	@echo "installing the scene builder's dependencies"
	@$(NPM) install

# ---------------------------------------------------------------- scenes

# The site itself is still served exactly as it sits in the repo: this builds the three
# committed artefacts and nothing runs at deploy time.
#
#   js/vendor/scenes/            ThreeUI's renderer engines, bundled and split (no React)
#   js/vendor/three/             three.js and the addons the shelf imports
#   scenes/*.html                the scenes, vendored out of the package and edited here
#   landing-pages/               the projects shelf, holding the public repositories
#
# Every generator asserts on the upstream text it edits, so a package bump that moves the
# ground fails here rather than silently shipping someone else's logo.
SCENE_SOURCES := build/bundle.mjs build/scenes.mjs build/shelf.mjs js/scenes.js

scenes: node_modules/.package-lock.json $(SCENE_SOURCES)
	@$(NODE) build/bundle.mjs
	@$(NODE) build/scenes.mjs
	@$(NODE) build/shelf.mjs

# ----------------------------------------------------------------- fonts

# The three .woff2 files the page loads are subsets, built from the .ttf sources beside
# them and committed like every other artefact here. Needs fonttools and woff2, which are
# packaging tools: nothing is installed to render the site. See build/fonts.mjs for what
# each subset keeps and why.
FONT_SOURCES := build/fonts.mjs assets/fonts/emotional-VF.ttf assets/fonts/MimoidVF.ttf \
                assets/fonts/jetbrains-mono-VF.ttf

fonts: $(FONT_SOURCES)
	@$(NODE) build/fonts.mjs

node_modules/.package-lock.json: package.json
	@$(MAKE) --no-print-directory install-site

check: check-site check-cv
	@echo
	@echo "all gates pass"

check-site: $(addprefix gate-,$(SITE_GATES)) reveal

# One target per gate, so a failure names itself and a single gate can be re-run alone.
$(addprefix gate-,$(SITE_GATES)): gate-%: | $(PUPPETEER)
	@printf '%-20s ' "$*"
	@$(NODE) tools/gate-$*.mjs | tail -1

reveal: | $(PUPPETEER)
	@printf '%-20s ' "reveal"
	@$(NODE) tools/check-reveal.mjs | tail -1

# A hand check rather than a gate: it drives the spray and the sound and prints what it saw,
# and drops a frame of a sprayed pass into lab/.
spray: | $(PUPPETEER)
	@$(NODE) tools/check-spray.mjs

check-cv: cv-test $(addprefix cv-gate-,$(CV_GATES))

cv-test:
	@printf '%-20s ' "cv renderer"
	@cd cv && $(NODE) --test render.test.js | grep -E '^# (pass|fail)' | tr '\n' ' '
	@echo

# pdf-pages reads the built PDFs, so it needs them to exist and be current first.
cv-gate-pdf-pages: cv
	@printf '%-20s ' "cv pdf-pages"
	@$(NODE) cv/scripts/gate-pdf-pages.mjs | tail -1

$(addprefix cv-gate-,$(filter-out pdf-pages,$(CV_GATES))): cv-gate-%:
	@printf '%-20s ' "cv $*"
	@$(NODE) cv/scripts/gate-$*.mjs | tail -1

.PHONY: $(addprefix cv-gate-,$(CV_GATES))

# ---------------------------------------------------------------- the CV

cv: $(CV_STAMP)

$(CV_STAMP): $(CV_SOURCES) | $(PUPPETEER)
	@cd cv && $(NPM) run --silent build
	@touch $@

# ---------------------------------------------------------------- looking at it

shots: | $(PUPPETEER)
	@$(NODE) tools/gate-shoot.mjs
	@echo "contact frames in lab/site/"

shots-cv: | $(PUPPETEER)
	@$(NODE) cv/scripts/shoot.mjs
	@echo "renders in cv/lab/"

# ---------------------------------------------------------------- cleaning

clean: clean-lab
	@rm -f cv/.build-*.html $(CV_STAMP)
	@echo "cleaned build leftovers"

clean-lab:
	@rm -rf lab cv/lab
	@echo "cleaned generated screenshots"
