# DESIGN.md: aurelioochoa.github.io

The visual world for a personal site that has to hold three lives at once: software
developer, certified agricultural drone pilot, trained cook. Replaces the previous bento
grid entirely. Product truth, content and the language switcher are preserved; the old look
is evidence and anti-reference, not a starting point.

**Design read:** personal site (Experience mode) for anyone who lands on his name, with a
playful jazz-noir-anime language crossed with N64-era low-poly, leaning toward vanilla CSS
plus hand-written WebGL and scroll-driven animation.

**Dials:** `DESIGN_VARIANCE: 9` · `MOTION_INTENSITY: 8` · `VISUAL_DENSITY: 4`.
Justified by the range answer (playful / weird) and the peak (an interactive WebGL moment).
Motion is claimed at 8, so motion is shown: hard cuts, kinetic type, a live drone.

**Grammar:** rhythmic cutlist. Fourteen short acts, nothing over 1.4 viewport-heights,
no pinned act anywhere on the page.

---

## Colour

Three worlds, three grounds, **one accent**. The accent is Signal Red and it is the same red
in every world: every interactive affordance, every CTA, the drone's rotor wash, the focus
ring. A world changes the ground under the visitor, never the meaning of the red.

```
tokens:
  # Accent, page-wide, never varies
  signal:        "#E4322B"   # every CTA, every control, focus ring, the drone
  signal-ink:    "#FFF6F5"   # text on signal

  # Ground A: CODE
  code-ground:   "#0B0D14"   # near-black indigo
  code-raise:    "#161A28"   # raised panel
  code-ink:      "#E8EAF2"
  code-soft:     "#8A90A8"
  code-amber:    "#F0A32C"   # terminal glow, used as light not as accent

  # Ground B: SKY
  sky-ground:    "#F2EDE4"   # bone
  sky-raise:     "#FFFFFF"
  sky-ink:       "#14181F"
  sky-soft:      "#5C6472"
  sky-cyan:      "#3AC5D9"   # atmosphere, used as light not as accent

  # Ground C: KITCHEN
  kitchen-ground:"#1A0F0C"   # warm near-black
  kitchen-raise: "#2A1A14"
  kitchen-ink:   "#F6EDE4"
  kitchen-soft:  "#A8907E"
  kitchen-ember: "#F0A32C"

  # Title cards
  card-ground:   "#08090D"
  card-ink:      "#F2EDE4"
```

No pure `#000000`, no pure `#ffffff` as page ground. The one white is a raised surface on the
bone ground only.

**Theme.** The page is committed: it is its own world, not a light/dark switcher. The grounds
are authored per act and the sequence is a deliberate colour-block story, which is the one
sanctioned exception to the single-theme lock. It does not follow `prefers-color-scheme`.

## Type

Three faces, all self-hosted in `assets/fonts`. No CDN, no network at render time.

| Role | Face | Spec |
|---|---|---|
| Display | **Emotional VF** | `clamp(3rem, 13vw, 11rem)`, weight 800-900, `letter-spacing: -0.04em`, `line-height: 0.88` |
| Title card | **Mimoid VF** | `clamp(4rem, 18vw, 16rem)`, weight 900, uppercase, `letter-spacing: -0.03em` |
| Body | **Emotional VF** | `clamp(1rem, 1.05vw + 0.8rem, 1.35rem)`, weight 400, `line-height: 1.5`, `max-width: 40ch` |
| Label / data | **JetBrains Mono** | `0.74rem`, uppercase, `letter-spacing: 0.18em` |

Emotional carries both display and body, so emphasis inside a headline is weight in one
family and never a second family. Mimoid is a pixel-tech face that stays legible for exactly
one short uppercase word, which is why it appears only on the three title cards.

This was settled by rendering a specimen, not by reading the font names. Two of the old
site's faces were tried and cut: **23.59** is illegible at label sizes (its own name renders
as ornament), and **Oceanus** is an outline display face with no functional use here. Both
were deleted along with Fraunces, which is a banned default and belonged to the old look.

No serif. The brief is playful and game-adjacent, not editorial, so a grotesque carries it.

**Emphasis** inside a headline is weight or the accent colour, never a second family.

## Shape

One radius system: **sharp**. `border-radius: 0` everywhere, including buttons and the canvas
frame. The single exception is the jazzskull's circular badge in act 13, which is a full
circle by nature. Hard edges are the N64 and title-card language; a rounded card would read
as a different site.

Borders are `2px solid` and they are structural, never decorative hairlines.

## Motion

- Every act enters with a **hard cut**, not a fade. Cue windows are front-loaded so a section
  is legible within the first third of its own span.
- Type assembles per word, `70ms` stagger, `transform` and `opacity` only.
- The drone is driven by `requestAnimationFrame` inside its own module and never touches
  layout.
- Scroll position is read with **IntersectionObserver** and a single `rAF`-throttled
  `scrollY` sample. `window.addEventListener('scroll')` doing layout work per frame is banned.
- `prefers-reduced-motion: reduce` collapses every entrance to instant, stops the drone's
  idle flight, and leaves the controls available but static until the visitor grabs them.

## The signature move

**The drone is a persistent chrome layer, and halfway down the page it becomes yours.**

A single low-poly quadcopter lives in one fixed, full-viewport, `pointer-events: none` canvas
that sits above every act and belongs to none of them. For the first eight acts it flies its
own path across whatever world is underneath. At act 9 the page hands over the controls, the
canvas takes pointer and key input, and it stays yours for the rest of the page: through the
kitchen, through the jazzskull, into the footer.

It is always drawn **in front of** the acts, because the handover's own line ("it has been
flying itself since you got here") is only true if the visitor has been watching it. Putting
it behind the grounds would have solved the overlap problem by making the claim false.
Collisions with copy are handled in the flight path instead: on autopilot the aircraft is
held in the top band, above where headlines sit, and the camera sits far enough back that it
reads as a distant aircraft crossing the page rather than an object parked on the text. Both
numbers were set by screenshotting the acts, not by estimating.

This is what lets a grammar that bans `pin` still hold its peak. The acts underneath keep
cutting at full speed and nothing is ever pinned; the hold happens in the chrome, which
outlives the act that started it.

## Imagery

Every image is a **generated placeholder** and is marked as one in the markup. Real drone,
kitchen and portrait photography exists and will replace them; each slot carries a
`data-replace` attribute naming what belongs there, so swapping a file needs no layout change.

The generated set shares one style preamble reused verbatim, which is what makes three
separate renders read as one shoot. Never paraphrase it.

## Bans specific to this project

- No em-dash anywhere visible. Hyphen, comma, colon or parentheses.
- No scroll cue, no arrow, no "scroll to explore". The drone crossing the name is the cue.
- No `01 / 14` act counters. The title cards name the worlds; sequence is not information.
- No eyebrow above every heading. Three across fourteen acts, and they are the title cards.
- No fake terminal built from divs. The CODE act's terminal is real markup with real text or
  it is a generated image, never dummy rectangles posing as a screenshot.
- No invented statistics. Three years, T50 and T100, DGAC 2025, B2 German are real. Nothing
  else gets a number.
- The skeleton band, the skullspider favicon and the useless-fact API are retired. The
  jazzskull survives.
