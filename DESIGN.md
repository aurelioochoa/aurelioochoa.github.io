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
  signal:        "#D62822"   # every CTA, every control, focus ring, the drone
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

**The accent is a background colour, not an ink.** No single red clears 4.5:1 against both
the near-white it carries as a button label and the near-black ground the acts sit on: the
two requirements pull in opposite directions. So Signal Red is chosen to pass as a *fill*
(4.72:1 with `signal-ink` on it, which is what every CTA and control needs) and it is used
as ink in exactly one place, act 2's "Cook.", where the type is large enough to owe 3:1
instead. Anywhere else the accent marks something, it marks it with a rule or a fill.

**Theme.** The page is committed: it is its own world, not a light/dark switcher. The grounds
are authored per act and the sequence is a deliberate colour-block story, which is the one
sanctioned exception to the single-theme lock. It does not follow `prefers-color-scheme`.

## Type

Three faces, all self-hosted in `assets/fonts`. No CDN, no network at render time.

| Role | Face | Spec |
|---|---|---|
| Display | **Emotional VF** | `clamp(3rem, 13vw, 11rem)`, `letter-spacing: -0.04em`, `line-height: 0.88` |
| Title card | **Mimoid VF** | `clamp(4rem, 18vw, 16rem)`, `wght 100`, uppercase, `letter-spacing: -0.03em` |
| Body | **Emotional VF** | `clamp(1rem, 1.05vw + 0.8rem, 1.35rem)`, `line-height: 1.5`, `max-width: 40ch` |
| Label / data | **JetBrains Mono** | `0.74rem`, uppercase, `letter-spacing: 0.18em` |

**Neither variable axis is a weight axis, whatever its tag says.** This was settled by
rendering both faces across their full range, and it is the single most load-bearing fact
about the type here:

- **Emotional** ships one stroke. Its `wght` axis runs -1000 to +1000 and the stem width
  never changes; what moves is the *lowercase*, which deforms into quirky alternates
  symmetrically away from 0. Uppercase is identical at every value. The page had been
  setting 800 and 900 everywhere, which is near the top of that dial, so every all-caps
  moment looked correct and every mixed-case heading rendered in wobbly alternates. The
  face is now declared as the single 400 it is and pinned to `wght 0` on `body`.
- **Mimoid** runs from a melted blob at -100 to the clean pixel cut at +100. The cards hold
  +100.

So there is no bold on this page to reach for, and nothing needs one: **emphasis is scale,
case and the accent**, never a second family and never a weight. Mimoid stays legible for
exactly one short uppercase word, which is why it appears only on the three title cards.

Two of the old site's faces were tried and cut the same way: **23.59** is illegible at label
sizes (its own name renders as ornament), and **Oceanus** is an outline display face with no
functional use here. Both were deleted along with Fraunces, which is a banned default and
belonged to the old look.

No serif. The brief is playful and game-adjacent, not editorial, so a grotesque carries it.

Any headline long enough to wrap sets `text-wrap: balance` and carries a `max-width`. A
headline owes a measure exactly like body copy does; act 8's ran the full 1000px of the page
while its own paragraph sat at 40ch.

## Shape

One radius system: **sharp**. `border-radius: 0` everywhere, including buttons and the canvas
frame. The single exception is the jazzskull's circular badge in the close, which is a full
circle by nature. Hard edges are the N64 and title-card language; a rounded card would read
as a different site.

Borders are `2px solid` and they are structural, never decorative hairlines.

## Motion

- Every act enters with a **hard cut**, not a fade. Cue windows are front-loaded so a section
  is legible within the first third of its own span.
- Type assembles per word, `70ms` stagger, `transform` and `opacity` only.
- The three title cards are the one kinetic-type moment: the word arrives out of Mimoid's
  melt and resolves into the pixel cut over `550ms`. It punctuates the hard cut into a new
  world, it happens three times, and it is an axis the face already ships rather than a
  second font or a library.
- The drone is driven by `requestAnimationFrame` inside its own module and never touches
  layout.
- Scroll position is read with **IntersectionObserver** and a single `rAF`-throttled
  `scrollY` sample. `window.addEventListener('scroll')` doing layout work per frame is banned.
- `prefers-reduced-motion: reduce` collapses every entrance to instant, stops the drone's
  idle flight, and leaves the controls available but static until the visitor grabs them.

## The signature move

**The drone is a persistent chrome layer, and halfway down the page it becomes yours.**

A single low-poly sprayer lives in one fixed, full-viewport, `pointer-events: none` canvas
that sits above every act and belongs to none of them. For the first eight acts it flies its
own path across whatever world is underneath. At the handover act the page hands over the
controls, the keyboard flies it, and it stays yours for the rest of the page: through the
kitchen and into the close, where the jazzskull now sees the visitor out.

It is drawn **in front of every ground**, because the handover's own line ("it has been
flying itself since you got here") is only true if the visitor has been watching it. Putting
it behind the worlds would have solved the overlap problem by making the claim false.

What it does pass behind is **objects**: the chrome, the three plates and the shelf. That is
the opposite of hiding it. A thing that is always in front of everything reads as a decal on
the glass; a thing that slides behind the header and comes back out is in the room. Each of
those elements opts in by carrying `data-drone="behind"` in the markup, and only opaque
rectangles may, because the mechanism covers a whole rect whether or not the element paints
it.

**The copy is the third case, and it goes both ways.** Headlines, body text and the three
title-card words carry `data-drone="cross"`, and the aircraft flies both over and under them:
it dives through one headline behind the letterforms and crosses the next one in front of
them, decided by its depth drift and nothing else. Those quads sit on a plane INSIDE the
drift, where the "behind" quads sit in front of all of it — that one difference is the whole
distinction between a thing you always pass behind and a thing you pass through.

A rect could not have bought this. Copy is mostly the ground showing between letters, so a
depth quad over a headline's rect is an invisible box that eats the aircraft whole. The quad
carries a **coverage mask rasterised off the element's own text** instead, and a fragment the
letterforms do not cover never writes depth, so the aircraft is cut out on the glyphs and
nowhere else.

The mask is drawn word by word off `Range` rects rather than off a re-implementation of line
breaking. The browser has already decided where every word sits; asking it is the only way
the mask lands on the glyphs at any viewport, in all three languages, in a face whose metrics
the renderer knows nothing about. The strings then go down in the element's own computed
font, which is exact here because both variable faces are pinned to their own default
instance in the stylesheet and a canvas cannot set a variation axis — had either been pinned
anywhere else, the mask would have been the right letters in the wrong shapes. It is baked in
element-local coordinates, so scrolling never invalidates one. A resize does, and so does a
mutation: the article headings decode out of scrambled letters as they enter, and a mask
taken mid-decode would have been permanently wrong in a way nothing later would correct.

**None of that is z-index, and none of it is a second canvas.** The canvas is one layer and
stays one layer. Each frame `js/drone.js` reads the viewport rects of the opted-in elements
and projects them into its own depth buffer as quads that write depth and no colour, so the
aircraft is clipped exactly where it is behind one and the transparent canvas lets the real
element through, edges included. It costs one small dynamic buffer and no DOM. The rects are
read inside the animation frame off an IntersectionObserver's live set, which is the same
rule the rest of the page follows: no scroll listener does layout work.

Collisions with **copy** used to be handled in the flight path rather than by layering: the
floor of the autopilot band stopped above where headlines sit. The masks are what let the
floor come down. The aircraft now dives through the copy and climbs back under the chrome,
and the dive is raised to a power so it holds up high for most of the cycle and passes
through the copy in the last third of it: a pass, never a park on something someone is
reading.

That band has to be built out of real measurements, because it is narrow. At the original
camera distance the aircraft was taller than the gap it had to fit in, so every band that
cleared the headlines put its rotors under the header and every band that cleared the header
put its body on a headline: it flew decapitated for eleven of the fourteen acts. The camera
is pulled back to 15.5 so the aircraft is small enough to fit, and the band is then written
against three measured quantities rather than guessed fractions of the frustum:

- the chrome's height, read from the element, so the phone breakpoint's shorter bar is
  respected without repeating the number,
- the aircraft's own half-extents in world units, taken off the geometry,
- the frustum half-width, which is far narrower on a phone. A bare fraction of it left a
  390px viewport with less room per side than the aircraft is wide and flew it half out of
  frame at both ends of every sweep.

All of it was set by screenshotting the acts at both widths, not by estimating.

The ceiling of that band is no longer the underside of the chrome. The chrome occludes now,
so the aircraft climbs past it and is cut off by the bar instead of clipped by it. The floor
moved only once the copy could occlude too: the failure it guarded against was an aircraft
sitting ON a headline, and an aircraft passing behind the letters of one is the opposite of
that.

This is what lets a grammar that bans `pin` still hold its peak. The acts underneath keep
cutting at full speed and nothing is ever pinned; the hold happens in the chrome, which
outlives the act that started it.

### The aircraft is the one he flies

The procedural model follows the [DJI Agras T50](https://ag.dji.com/t50): four folding
arms in an X, two coaxial counter-rotating rotors on each, a pale removable tank behind an
upright battery, and an open graphite landing frame. It remains a stylised WebGL model,
not a dimensional CAD replica. The original red landing rails and pale rectangular arms
have been replaced by thin carbon-coloured tubes; Signal Red is confined to small arm tabs.

The tank uses stacked rectangular frusta, with a tapered sump, sloping shoulders, recessed
side ribs and a filler cap. The battery has an open carrying handle. Folding hinges,
arm collars, motor cooling fins, front binocular sensor windows, radar housings, pump and
atomisers give the aircraft readable mechanical detail. A general tube primitive builds
the diagonal carbon arms, plumbing and the two fore-aft landing loops. The nozzles remain
aligned with the spray simulation's emission points.

Each rotor has two tapered blades. Opaque swept discs have been removed so the space
between the coaxial pairs stays visible. Camera framing, flight limits, keyboard controls,
reduced-motion behaviour and the page's depth masks retain their existing contracts.

The banded light was retuned with it. The key used to sit high and BEHIND the aircraft, and
the view matrix is a bare translation, so the faces the visitor actually sees — the ones
pointing at them — all landed in the second band from the bottom: a white hull that rendered
charcoal on every ground. The key is now high and forward, and the five bands come out as a
ladder the shape reads off: top, facing, lit side, shaded side and tail, belly.

The rotors turn, and each coaxial pair turns against the other. They are a separate buffer
drawn eight times with its own model matrix rather than baked into the airframe, which is
what makes that possible at all.

The aircraft carries a permanent lean toward the viewer, applied in **world space, outside
its own yaw**. The view matrix is a bare translation, so the camera has no elevation: a rotor
plane lying flat is exactly edge-on and eight of them render as one grey rod. Leaning it in
its own body frame instead looks right until it has turned a quarter turn, at which point the
lean axis points at the camera and the discs shut again for a quarter of every revolution.
Leaning the CAMERA would have been the obvious fix and is the wrong one: the occluder quads
are projected against an untilted view, and a tilted camera skews every one of them off the
element it stands in for.

### Powering on is the real sequence, and so is the spray

The controller's press-and-hold was already the real ritual. The aircraft now answers it with
its own. Straight off DJI's status-indicator table: alternating red, green and yellow while it
runs its self diagnostics, four yellow blinks while it warms up, then solid green once the
link is up, settling into the slow green that means GNSS is enabled and is what it shows for
the rest of the page. It has four arm lights and a beacon to show it on, and the controller's
screen carries the same three states in words, in all three languages.

**Arming is immediate and the sequence is only lights and copy.** The keys are live on the
tick the hold completes. A control that ignores you for two and a half seconds after you
turned it on reads as broken, not as authentic, and `gate-drone` asserts the aircraft is
armed the instant the hold finishes.

The spray is the dial, where the dial is on the real controller: right shoulder, under the
stick. On an RC Plus you turn it for rate and press it to start and stop; there is no rate to
set here, so what is left is the press. F does the same thing from anywhere on the page,
guarded so a press that landed on a control is left to that control, and the two nozzles
throw a fan along the boom rather than a plume out of the aircraft's middle.

Not the space bar, which was the obvious choice. The arrows are already spent on flying, and
the space bar is what a keyboard-only visitor scrolls this page with: on a page that is
nothing but scrolling, that is a bigger bill than the spray is worth.

### The spray lands on the page, and it dries

The fan used to be one red colour, and it fell out of the frame. It now leaves marks.

A droplet that has finished falling has to land on something, and there is nothing in this
scene to land on: the page is behind the canvas, not inside it. So it lands on the page. Each
mark is fixed in **document** space at the point the droplet left the world, drawn with the
depth test off and last of all, which puts the paint in front of everything including the
copy the aircraft is otherwise so careful to fly behind. That is the point of it, and it is
also why every mark is on a timer: they hold their colour for most of a life of four and a
half to seven and a half seconds and go in the last of it.

**Document space and not screen space, and that is the whole difference between a trail and a
smear.** The canvas is fixed to the viewport, so a mark held in clip coordinates would be
glued to the visitor's screen: lay a pass over the handover copy, climb, and the paint would
ride up the page with you and sit over whatever you arrived at. It reads as a rendering
artefact rather than as paint, which is exactly the thing the timer is there to avoid. So the
mark keeps a distance down the document instead, and the draw converts it back with the
frame's scroll offset. Fly on and take the page with you and the paint stays over the ground
it hit, goes off the bottom of the frame, and is still there, dimmer, if you come back inside
its life. Only Y is held this way: nothing on this page scrolls sideways, so X stays in clip
space and never needs converting.

**The mist is multicolour and that is a decision about what this page is, not about what a
sprayer is.** Real tank mix is one colour and it is usually the colour of water. This is a
toy on a portfolio, the visitor has just taken the controls, and what they get for it is
paint. The hue advances by the golden angle per droplet, so consecutive droplets are never
neighbours on the wheel, at `HSL(h, 0.95, 0.56)`: saturated, just above the middle in
lightness, because these land on the code world's near-black ground as often as on the sky
world's paper and have to hold up on both.

Rotor wash is the exception and stays the aircraft's own dust colour. It is the kick-up from
moving hard rather than something the visitor asked for, and paint nobody asked for is
vandalism rather than a toy. Only a droplet from a deliberate pass leaves a mark, one in four
of them, which is the rate that lets the ring buffer hold a whole mark's life: any faster and
the paint would be recycled long before it dried, and the timer above would be a decoration.

**The spray also has a switch in the chrome, next to the sound.** The dial is the ritual and
stays dead until the handover; the switch is the page's own and is live the whole way down,
because the aircraft has been flying itself since the visitor got here and there is no reason
it cannot be painting while it does. All three controls, the switch, the dial and F, ask the
aircraft the same question, and the aircraft owns the answer: nothing on the page holds its
own copy of whether the booms are open. Turning it off leaves the paint already down to dry
on its own timer, because wiping the glass on a switch would make the marks read as a
rendering artefact rather than as paint. Reduced motion gets no switch, because it has no
spray.

### The sound is generated, and it starts off

Everything this page makes a noise with is synthesised in the Web Audio graph, from
oscillators and one buffer of white noise. Nothing is fetched, so `gate-no-network` stays
true and the repo gains no binary, but that is a side effect rather than the reason.

The reason is that the rotors have to answer the visitor. A recorded loop of a real aircraft
plays back at one speed and one load forever, so it says the same thing while the drone is
parked as it does while someone is hauling it across the page with the keys, and a rotor note
that ignores the throttle reads as a backing track laid over the aircraft rather than as the
aircraft.

What is modelled is the real thing. A multirotor's dominant tone is its blade-pass frequency;
small drones sit at 100 to 300 Hz, an agricultural airframe swings much bigger props much
slower, so this one runs from 78 Hz idling to about 132 Hz worked hard, with a harmonic
ladder over it and a broadband wash in the low kHz from blades cutting turbulent air. Four
voices carry the tone rather than one, detuned a few cents apart, because eight rotors are
never in phase and the beat between them is what makes a multirotor sound like a multirotor.
The throttle is the work the aircraft is doing, not its airspeed: holding station is the
floor, being flown is most of the rest, and opening the booms puts a load on top of that.

The controller gets the rest of it. A press when it primes, a tone that rises for exactly as
long as the hold's track fills, so someone holding the button without watching it still knows
it is counting, a fall away if they let go early and a clean cut if they do not, the
aircraft's three power-on steps as three notes, and the pump and the valve at each end of a
spray pass.

**It starts off, it is remembered, and it comes back on the visitor's first gesture rather
than on load.** A browser will not let an audio context make a sound outside a gesture and it
is right not to: a page that starts talking on load is a page people close.

### Flying it takes the page with it

Fly the aircraft up and the page comes up. Fly it down and it goes down. The further past the
middle of the frame it is, the faster the page moves.

This is the other half of a debt the handover incurs. Arming the drone spends the arrow keys
and W and S on flying it, which is exactly the keyboard scrolling the visitor had a moment
earlier. Giving it back through the aircraft is the only version of it that costs nothing to
learn: the thing you are already steering is the thing that moves the page.

Two rules keep it civil.

- **A dead band through the middle of the frame**, a third of the frustum either side of
  centre, where flying is only flying. Line up a shot, correct a drift, cross the frame: none
  of that drags the page out from under the copy someone is reading. The rate then eases in
  from zero at the band's edge to its maximum at the limit of where the aircraft may fly, so
  the page creeps rather than snapping into a scroll.
- **The rate is tied to the key being held, not only to the position.** An aircraft parked
  near the top edge with nothing pressed sits still. Position alone would have meant letting
  go at the top of a climb and watching the page keep running until it hit the end of the
  document.

The scroll is written **after** the frame is drawn, and that ordering is the point of it
being a separate step. `draw()` reads the occluders' rects; scrolling is a layout write.
The other way round is a read straight after a write on every frame the visitor is climbing,
which is the one thing this module has always promised not to do. Whole pixels only, with the
remainder carried, because at the bottom of the ramp a frame is worth a fraction of a pixel
and rounding it away would stall the creep. And explicitly `behavior: 'instant'`: the page
sets `scroll-behavior: smooth`, and a smooth `scrollBy` every frame queues sixty animations
a second that spend their time fighting.

### The canvas never takes a pointer event, and the handover is an object

Drag-to-fly was in the first cut and it is gone. The reason is structural rather than a
matter of taste: this canvas is fixed, full-viewport and at `z-index: 50`, so the instant it
stops being `pointer-events: none` it is a sheet of glass over every control on the page.
From the handover onward the CV link, the language toggle, the email CTA and the whole
projects shelf were catching the drone instead of the pointer. Flying is worth a lot; it is
not worth the rest of the site. `tools/gate-drone.mjs` now asserts the canvas is still
`pointer-events: none` after arming, and that a hit test at the chrome's CV link reaches the
link, so the regression cannot come back quietly.

What replaces the drag is better than the drag was. The handover act carries **the controller
Aurelio actually flies**, as line art, and the affordance is its own power button, bottom
right, ringed and pulsing in Signal Red because it is the one thing on this page a visitor
has to find. The sequence is the real one: press it once, then press and hold it for two
seconds. The controller's screen is real markup rather than a texture, so it is translatable
and a screen reader can read it, and it says what state the thing is in the whole way
through: `Controller off / Press power`, then `Standby / Hold power for two seconds` over a
filling track, then `Linked / Fly with W A S D` under a cyan backlight. Release early and the
track drops to zero, which is what the hardware does.

Two implementation notes that are load-bearing:

- The screen and the button are positioned as percentages of the **art's own ink bounding
  box**, not of their container, and the numbers were measured off the PNG's alpha channel
  (`build/controller.py` crops to the same box). The power ring is at 86.75% x, 89.88% y.
  The ring itself is about 30px across at the shipped width, which is under any sane touch
  target, so the hit area is a 48px square centred on it and the visible ring is drawn by a
  pseudo-element sized in `cqw`.
- The two-second hold is completed by a `setTimeout`, and `requestAnimationFrame` only draws
  the track filling. A hold whose completion depends on frames arriving silently refuses to
  finish whenever frames stop, and to the visitor that is indistinguishable from a broken
  button.

## Imagery

Every image is a **generated placeholder** and is marked as one in the markup. Real drone,
kitchen and portrait photography exists and will replace them; each slot carries a
`data-replace` attribute naming what belongs there, so swapping a file needs no layout change.

The generated set shares one style preamble reused verbatim, which is what makes three
separate renders read as one shoot. Never paraphrase it.

`assets/art/` is a different thing and is deliberately not `assets/img/`. It holds authored
interface art, which today means the controller in the handover act. Nothing in it is a
placeholder waiting for a photograph, so nothing in it carries a `data-replace` slot, and
`tools/gate-tells.mjs` only demands that slot of `assets/img/`. The controller is a lossless
WebP cropped to its own ink, 95KB, extracted from the source SVG once by
`build/controller.py`; the SVG was a 906KB XML wrapper around a single embedded PNG whose
colour channels were black everywhere and whose entire drawing lived in the alpha.

Two textures on this page are neither photograph nor art file, because they are drawn in
code at run time: the cloud puff behind the SKY card (`js/clouds.js`, six radial gradients
serialised once to a `data:` URI) and the three cloth banners behind the KITCHEN card
(`build/scenes.mjs`). Both exist that way because of the no-network gate, and both are
better for it: a texture built from the site's own palette cannot drift from it.

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
  jazzskull survives, and now closes the page rather than holding an act of its own. He kept
  the fact he used to say and lost the request that fetched it: the facts ship in the three
  language files, so they are translated like every other string and the no-network gate
  stays true. The badge itself links out to the video that sourced the GIF, which
  with the credit beside it makes the two links in the close that are about someone else.
- No third-party request at render time, from the page or from inside any scene's iframe.
  This is not a preference, it is the `no-network` gate.

## The ThreeUI scenes, and where they sit against all of the above

Five surfaces are ThreeUI scenes: the hero's keycap field, the elemental marks behind acts 5,
11 and 13, the three cloths behind the Kitchen card, the liquid metal button in the close,
and the projects shelf. They are vendored into `scenes/` and `landing-pages/` and edited by
`build/scenes.mjs`; the engines they need are bundled into `js/vendor/scenes.bundle.js`.

**They are the sanctioned exception to the colour and type rules above.** A scene brings its
own palette and its own light, and forcing Signal Red onto a fire shader or a chrome pill
would leave both worse. What is held instead is the boundary:

- Every scene is decorative and `aria-hidden`, sitting behind an act's own copy, which keeps
  its own colour, its own face and its own contrast. Nothing a visitor has to read is inside
  a scene.

  **Behind is not a z-index, it is a blend, and this is where that rule was being broken.**
  Every elemental-marks document paints its own body `#060708` and glows on top of it. On
  the two dark worlds that is invisible. On the bone one it was a blackout: act 11 laid
  near-black across a `#F2EDE4` act and then rendered the sky world's near-black ink on it,
  so the DGAC certification, the airframes and the languages sat at about **1.1:1** and
  could not be read at all. Those frames now carry `.act__scene--wash`, which is
  `mix-blend-mode: screen`: black is what screen leaves untouched, so the ground comes back
  at full strength, the ink keeps every bit of its contrast, and the mark is left as a bloom
  on the paper. It is the same reason the burner over the stove blends, and it is the right
  way round, because the scene is decorative and the copy is not.

  Opacity was the other candidate and it is the wrong one: it composites the frame's black
  ground too, so at the strength that tames the glow it drags the bone halfway to grey and
  takes the copy down with it.

  Act 13 gained the same class for the opposite reason. Its `#060708` was **darker** than
  the kitchen's `#1A0F0C`, so the scene was flattening that world's warmth and swallowing
  its own burning `COCINA`. Screened, the ground is warm again and the mark is visible for
  the first time.

- **A mark is centred in the box it is given, so the box is what keeps it off the copy.**
  Act 5's `STACK` was centred in an act whose stack rows are also centred, and it sat
  straight across Back-end and Systems: the one list on this page a reader actually scans.
  `.act__scene--crown` confines that frame to the act's top band, which lifts the mark clear
  and makes it a crown over the rows instead of a collision with them. The band's bottom
  edge is feathered with a mask, because screen still lifts `#0B0D14` by the few levels of
  `#060708` and a hard-edged band of that is a seam across the act.
- Scenes carry this site's words, never a vendor's. The elemental marks burn `COCINA` and
  electrify `STACK` where they shipped rendering the OpenAI, Anthropic and Claude logos; the
  cloth is woven with `AURELIO OCHOA`, not the studio it came from. The shelf no longer
  titles itself either: act 7 already carries "In the open" in the page, in the page's own
  display face, one line above the frame, and the scene was repeating it underneath in the
  largest serif on a site whose type system has no serif in it. What the scene's header
  keeps is the half that is not a repeat, which is where to go and find the repositories.
  Its `01 / 10` went at the same time, because an act counter under another name is still on
  the ban list and the ten markers beside it already say the same thing without being read.
  The slot carries the selected repository's discipline instead.

- **A scene's palette is the one thing the boundary does not excuse, when the scene has no
  palette of its own to bring.** The hero is the warp field on its keycaps variant, and that
  renderer hardcodes every colour it draws: `hue`, `saturation` and `brightness` are declared
  in its defaults and read nowhere, so the three of them sitting in `index.html` were setting
  nothing and one was claiming to set a colour. What the variant actually ships is Tailwind's
  emerald, cap bodies through key light, and emerald belongs to no world here. It was the
  only colour above the fold.

  That is not a scene bringing its own light, it is a default nobody chose, so it is patched
  on the way into the bundle by `build/bundle.mjs`, asserting on the upstream text the way
  every other vendored edit in this repo does. The field is a keyboard in the CODE world
  afterwards: cap bodies off `code-raise`, legends in `code-ink` with `code-amber` for the
  lit ones, `code-soft` dust, and the amber is the terminal glow that world already uses as
  light rather than as an accent. Patching the source rather than filtering the canvas is
  deliberate twice over: a `filter: hue-rotate()` on a fixed full-viewport canvas above the
  fold re-filters every frame for the whole visit, and a rotation can only land near a token,
  never on one.

  The two dials that renderer does read are `tileOpacity` and `streakOpacity`. At 0.72 and
  0.5 the field read as dust and the hero was a flat black rectangle with a name on it; they
  are 0.95 and 0.8.
- The Kitchen card hangs **three** cloths, not one, because one kitchen is not one tradition:
  a Japanese noren on the left (indigo, seigaiha waves, an enso, the slits that make it a
  noren and not a flag), Aurelio's own banner in the middle with knife, flame, whisk and pot
  running along both hems, and an Ecuadorian Otavalo weave on the right (banded, a stepped
  greca escalonada, rombos, and the fringe of a cloth cut off a loom). Every one of them is
  drawn on a canvas in `build/scenes.mjs`. What survives from upstream is the Verlet
  simulation itself, generalised out of the module-level state it was written against so
  three panels can run through the same integrator, solver, wind field and pinned top row;
  the generator asserts on five landmarks of that code, so a package bump that moves it
  fails the build rather than shipping a cloth nobody authored.
- All three hang at the same width, 4.40 world units, 0.22 apart, and the landscape camera
  frames 13.8 units so every one of them is whole. The side plates are drawn at the banner's
  proportions rather than stretched to them: each pattern loops against the plate's width, so
  a wider plate lays down more seigaiha and more rombos instead of ovals. The two single
  marks that cannot repeat, the enso and the seal, are scaled with the cloth by hand.
- On a portrait viewport the camera reframes to the banner alone. Fitting three cloths across
  a phone would shrink all of them to nothing; the sides run off as slivers instead, which is
  what cloth hanging past a doorway does anyway.

The SKY title card's clouds are **not** a ThreeUI scene and not WebGL at all: they are
spite's CSS3DClouds (a perspective container, a `preserve-3d` world, sprites that
counter-rotate against it every frame) in `js/clouds.js`. That matters for a budget reason as
well as an aesthetic one. The page already runs the drone's context plus up to two scene
contexts, and browsers cap WebGL contexts at around sixteen; this costs none of them. Two
things are ours rather than upstream's: the puff is drawn on a canvas instead of fetched, and
there is no mouse look, because stealing the pointer to fly a decorative camera would be the
same mistake the drone's drag was.
- The type inside a scene is the site's own display face, loaded from `assets/fonts`.
- A scene offscreen is not paused, it is disposed. It holds a live WebGL context and a
  running animation frame, and browsers cap contexts at around sixteen.
- A scene never loads while the act above it is still entering: an iframe shares this main
  thread, and a scene build lands squarely in the neighbouring act's entrance transition.

### Portada navigation refinement

The name, local fonts, three colour worlds and fourteen-act sequence are preserved
(design variance 8, motion 7, density 3). A quieter keyboard field and a dark fade beneath
the name improve reading contrast. The location and three translated world links share
one ruled footer; the links stack below the location on phones and work as native anchors
without JavaScript. Anchor targets clear the fixed chrome. Project descriptions use brighter
ink and more line spacing for easier reading. No runtime dependency or external asset was
added.
