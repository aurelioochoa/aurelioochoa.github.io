# GATES: site redesign

Scope: the public site at the repo root. The bento grid, the skeleton band, the useless-fact
footer and the old stylesheets are replaced. The language switcher, the CV links and the
three-language content are preserved functionality and must keep working.

OWNS: index.html styles/ js/ tools/ assets/languages/ assets/img/ assets/fonts/ assets/gif/

- [x] G1 The old design is gone: no bento markup, no retired skeleton GIFs, no useless-fact
      call, no orphaned stylesheet left in the repo or referenced from the page.
      CHECK: node tools/gate-old-site-gone.mjs
      EXPECT: OLD_SITE_GONE_OK
- [x] G2 Every asset the page references resolves to a file on disk (no 404s).
      CHECK: node tools/gate-links-resolve.mjs
      EXPECT: LINKS_RESOLVE_OK
- [x] G3 The three language files share one key shape and cover every translatable node
      the page declares, so no language renders a blank or an English fallback.
      CHECK: node tools/gate-i18n-complete.mjs
      EXPECT: I18N_COMPLETE_OK
- [x] G4 The language switcher still works end to end: auto-detection, toggle, persistence,
      and a language-appropriate CV link.
      CHECK: node tools/gate-e2e.mjs
      EXPECT: E2E_OK
- [x] G5 The page carries no banned tell: zero em-dashes in visible copy, no scroll cue,
      no act counters, and at most ceil(acts/3) eyebrow labels.
      CHECK: node tools/gate-tells.mjs
      EXPECT: NO_TELLS_OK
- [x] G6 The WebGL drone initialises, renders, and hands over control, and the page degrades
      cleanly when WebGL is unavailable or reduced motion is requested.
      CHECK: node tools/gate-drone.mjs
      EXPECT: DRONE_OK
- [x] G7 The page holds up at every scroll position on desktop and on a 390px phone, with no
      horizontal overflow and no act left unreadable.
      CHECK: node tools/gate-shoot.mjs
      EXPECT: SHOOT_OK
- [x] G9 The entrance actually completes on its own, with nothing forced, both above the
      fold and for an act reached by scrolling.
      CHECK: node tools/check-reveal.mjs
      EXPECT: REVEAL_OK
- [x] G8 The built page looks right (manual, contact sheet).
      MANUAL: read the desktop and mobile contact sheets in lab/site/ act by act, and drove
      the page in a real GPU browser (ANGLE / Radeon RX 6700S).
      EVIDENCE: five defects were found this way and fixed, none of which any automated
      check had reported:
        1. The reveal selector never matched, so every act's copy was invisible. The class
           was set on the act itself, but the rule expected it on an ancestor.
        2. Content depended on JS to become visible at all. Reveal is now opt-in, so the
           page is readable before and without the observer, plus a stall backstop.
        3. 23.59 was illegible at label size and Oceanus unusable. Both cut, JetBrains Mono
           vendored for labels, Emotional promoted to display.
        4. The drone flew over headlines and made them unreadable. Camera pulled back and
           the autopilot confined to the top band, above where headlines sit.
        5. The peak was not the longest act on mobile: the blanket .act rule in the phone
           media query was overriding it on source order.
