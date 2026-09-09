// The drone.
//
// One low-poly Agras-class sprayer in a fixed, transparent, full-viewport canvas that sits
// above every act and belongs to none of them. For the first half of the page it flies its
// own path. From the handover act onward the controls are the visitor's, and they stay the
// visitor's for the rest of the page.
//
// The controls are the KEYBOARD, and only the keyboard. Drag-to-fly was here and it had to
// go: this canvas is fixed, full-viewport and at z-index 50, so the moment it takes pointer
// events it is a sheet of glass over the entire page. Every click after the handover, the
// CV link, the language toggle, the email CTA, the shelf, landed on the drone instead of on
// the control the visitor was aiming at. Flying is worth a lot; it is not worth the rest of
// the site. So the canvas is pointer-events: none for its whole life, and W A S D (and the
// arrows) are bound on the window, where they cost nothing. F is the spray: the real
// controller sprays on a dial press, and the space bar is what a keyboard-only visitor
// scrolls this page with, so it is not ours to take.
//
// It is in front of every ground, behind selected objects, and both over and under the
// page's copy. See the occluder section below: the canvas is one layer, so depth against
// the page is bought with depth-only quads projected from the rects of the elements that
// opt in, not with a second canvas and not with z-index. Copy opts in the same way and is
// drawn into the same depth buffer, with the element's own text rasterised onto the quad
// as a coverage mask so the aircraft is cut out on the letterforms and nowhere else.
//
// Written against raw WebGL on purpose: the aircraft is lightweight procedural geometry, so a
// 700KB engine would cost more than it returns, and the repo stays buildless.

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform mat3 uNormalMat;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vNormal = normalize(uNormalMat * aNormal);
  vColor = aColor;
  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
}`;

// Flat, banded lighting. Quantising the diffuse term is what keeps the shading reading as
// vertex-lit 1997 hardware instead of a smooth modern render.
//
// The key is high and well FORWARD of the aircraft, and that is a fix rather than a taste.
// The view matrix is a bare translation, so what the visitor sees most of is the faces
// pointing at them, and a key set high and behind put every one of those in the second band
// from the bottom: a white hull that rendered charcoal on every ground. Under this one the
// five bands come out as a ladder the shape reads off — top 1.0, facing 0.8, the lit side
// 0.6, the shaded side and the tail 0.4, the belly 0.2.
const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
uniform float uAlpha;
void main() {
  vec3 n = normalize(vNormal);
  float key = max(dot(n, normalize(vec3(0.40, 0.85, 0.75))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.65, 0.20, -0.35))), 0.0);
  float lit = 0.34 + 0.90 * key + 0.22 * fill;
  lit = floor(lit * 5.0) / 5.0;
  gl_FragColor = vec4(vColor * lit, uAlpha);
}`;

// The mist. Every droplet carries its OWN colour rather than reading one uniform, which is
// the whole difference between a red jet and the thing the spray is now: a fan of tank mix
// where no two droplets came out the same colour. The sprite is soft to its edge as well;
// the hard disc it used to be read as confetti at these sizes.
const PARTICLE_VERT = `
attribute vec3 aPos;
attribute float aLife;
attribute vec3 aTint;
uniform mat4 uProj;
uniform mat4 uView;
varying float vLife;
varying vec3 vTint;
void main() {
  vLife = aLife;
  vTint = aTint;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
  gl_PointSize = max(1.0, 8.0 * aLife);
}`;

const PARTICLE_FRAG = `
precision mediump float;
varying float vLife;
varying vec3 vTint;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vTint, smoothstep(0.25, 0.01, r) * vLife * 0.9);
}`;

// The paint on the page.
//
// A droplet that has finished falling has to land on something, and there is nothing in
// this scene to land on: the page is behind the canvas, not inside it. So it lands on the
// page. Each splat is fixed in DOCUMENT space at the point the droplet left the world: it
// keeps a distance down the document, and the draw turns that back into a clip coordinate
// with the frame's scroll offset. So the aircraft flies on, the page scrolls, and the paint
// goes with the ground it hit rather than with the visitor's screen.
//
// The shader still needs no matrices for it: the conversion is one subtraction and one
// divide per mark, done on the way into the buffer, and the vertices arrive in clip space.
//
// Drawn with the depth test off and last of all, so paint is in front of everything,
// including the copy the aircraft is otherwise so careful to fly behind. That is the point
// of it. It is also why every one of them is on a timer.
const SPLAT_VERT = `
attribute vec2 aNDC;
attribute vec3 aTint;
attribute float aLife;
attribute float aSize;
varying vec3 vTint;
varying float vLife;
void main() {
  vTint = aTint;
  vLife = aLife;
  gl_Position = vec4(aNDC, 0.0, 1.0);
  gl_PointSize = aSize;
}`;

// Dense in the middle, with a heavier rim where the liquid pooled at the edge of the mark.
// The fade is on the life rather than on a timer of its own, so a splat thins out as it
// dries instead of blinking off.
const SPLAT_FRAG = `
precision mediump float;
varying vec3 vTint;
varying float vLife;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.08, r);
  float rim = max(smoothstep(0.5, 0.4, r) - smoothstep(0.4, 0.28, r), 0.0);
  // A mark holds its colour for most of its life and goes in the last of it. Fading from
  // the moment it lands makes every mark look half dry the instant it arrives.
  float fade = smoothstep(0.0, 0.45, vLife);
  gl_FragColor = vec4(vTint, (core * 0.82 + rim * 0.45) * fade);
}`;

// The status lights. Unlit and additive: an LED is a light source, not a lit surface, so it
// has no business going through the banded diffuse shader.
const LIGHT_VERT = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uSize;
void main() {
  gl_Position = uProj * uView * vec4(aPos, 1.0);
  gl_PointSize = uSize;
}`;

const LIGHT_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(uColor, smoothstep(0.25, 0.0, r) * uIntensity);
}`;

// The occluders never draw a pixel, so they need no varyings, no normals and no colour.
const OCCLUDE_VERT = `
attribute vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
void main() { gl_Position = uProj * uView * vec4(aPos, 1.0); }`;

const OCCLUDE_FRAG = `
precision mediump float;
void main() { gl_FragColor = vec4(0.0); }`;

// The copy occludes too, and it occludes GLYPH BY GLYPH. Same trick as the occluders above
// and the same two lines of colour, with one difference: the quad carries a coverage mask
// rasterised off the element's own text, and a fragment the text does not cover is thrown
// away before it can write depth. A plain rect would have been an invisible box that ate
// the aircraft whole; this cuts it out on the letterforms and nowhere else.
const MASK_VERT = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uProj;
uniform mat4 uView;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}`;

const MASK_FRAG = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uMask;
void main() {
  if (texture2D(uMask, vUV).a < 0.4) discard;
  gl_FragColor = vec4(0.0);
}`;

/* ---------- tiny mat4 / mat3 ---------- */

const m4 = {
  identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  },
  translation(x, y, z) {
    const o = m4.identity();
    o[12] = x; o[13] = y; o[14] = z;
    return o;
  },
  rotationX(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const o = m4.identity();
    o[5] = c; o[6] = s; o[9] = -s; o[10] = c;
    return o;
  },
  rotationY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const o = m4.identity();
    o[0] = c; o[2] = -s; o[8] = s; o[10] = c;
    return o;
  },
  rotationZ(a) {
    const c = Math.cos(a), s = Math.sin(a);
    const o = m4.identity();
    o[0] = c; o[1] = s; o[4] = -s; o[5] = c;
    return o;
  },
  scaling(x, y, z) {
    const o = m4.identity();
    o[0] = x; o[5] = y; o[10] = z;
    return o;
  },
  // A point through a model matrix. The nozzles and the status lights are fixed points on
  // the airframe, and both need their WORLD position: the spray leaves the aircraft and
  // stops being attached to it, and the lights are drawn by a program with no model uniform.
  transformPoint(m, x, y, z) {
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
  },
  // Normal matrix for a rotation-and-uniform-scale model matrix: the rotation block is
  // orthonormal once the uniform scale is divided out, so the inverse-transpose reduces to
  // the rotation block itself.
  normalFromRotation(m) {
    return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  },
};

/* ---------- geometry ---------- */

// One flat quad, wound a, b, c, d, with the face normal taken off its own edges. Everything
// that is not axis-aligned is built out of these.
function pushQuad(g, a, b, c, d, color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  for (const t of [[a, b, c], [a, c, d]]) {
    for (const p of t) {
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(nx, ny, nz);
      g.col.push(color[0], color[1], color[2]);
    }
  }
}

// Axis-aligned box, emitted as 12 flat-shaded triangles with per-face normals.
function pushBox(g, cx, cy, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const faces = [
    { n: [0, 0, 1], v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]] },
    { n: [0, 0,-1], v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]] },
    { n: [0, 1, 0], v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]] },
    { n: [0,-1, 0], v: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]] },
    { n: [1, 0, 0], v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]] },
    { n: [-1,0, 0], v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]] },
  ];
  for (const f of faces) {
    const [a, b, c, d] = f.v;
    for (const t of [[a, b, c], [a, c, d]]) {
      for (const p of t) {
        g.pos.push(p[0], p[1], p[2]);
        g.nrm.push(f.n[0], f.n[1], f.n[2]);
        g.col.push(color[0], color[1], color[2]);
      }
    }
  }
}

// A rectangular beam from one point to another in the XZ plane, tapering if the far end is
// given its own section. The arms of an Agras run diagonally out of the hub and thin toward
// the motor, and an axis-aligned box cannot express either: it would leave the motors
// floating off the ends of four stubs of constant thickness that point the wrong way.
function pushBeam(g, x0, y0, z0, x1, y1, z1, w, h, color, w1 = w, h1 = h) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = -dz / len, uz = dx / len;
  const c = (x, y, z, s, t, ww, hh) => [x + ux * (ww / 2) * s, y + (hh / 2) * t, z + uz * (ww / 2) * s];
  const a0 = c(x0,y0,z0,-1,-1,w,h), b0 = c(x0,y0,z0, 1,-1,w,h);
  const b1 = c(x0,y0,z0, 1, 1,w,h), a1 = c(x0,y0,z0,-1, 1,w,h);
  const d0 = c(x1,y1,z1,-1,-1,w1,h1), e0 = c(x1,y1,z1, 1,-1,w1,h1);
  const e1 = c(x1,y1,z1, 1, 1,w1,h1), d1 = c(x1,y1,z1,-1, 1,w1,h1);
  pushQuad(g, a1, b1, e1, d1, color);   // top
  pushQuad(g, d0, e0, b0, a0, color);   // bottom
  pushQuad(g, a0, a1, d1, d0, color);   // one side
  pushQuad(g, e0, e1, b1, b0, color);   // the other
  pushQuad(g, b0, b1, a1, a0, color);   // hub cap
  pushQuad(g, d0, d1, e1, e0, color);   // outer cap
}

// Flat n-gon disc in the XZ plane. Eight segments, because the silhouette should read as
// faceted rather than round. `dir` flips the normal so the same call can cap the bottom of
// a cylinder: nothing here is back-face culled, so the winding is free and the normal is
// the only thing that decides how a face is lit.
function pushDisc(g, cx, cy, cz, radius, segments, color, dir = 1) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, cy, cz + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, cy, cz + Math.sin(a1) * radius];
    for (const p of [[cx, cy, cz], p0, p1]) {
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(0, dir, 0);
      g.col.push(color[0], color[1], color[2]);
    }
  }
}

// A tapered n-gon prism about the Y axis. The motor bells, the masts, the radar pods, the
// gimbal and the nozzle bodies are all this one shape at different proportions, and having
// it is what let the airframe stop being a pile of boxes.
function pushCyl(g, cx, cy, cz, rBottom, rTop, h, segments, color, caps = true) {
  const y0 = cy - h / 2, y1 = cy + h / 2;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const b0 = [cx + Math.cos(a0) * rBottom, y0, cz + Math.sin(a0) * rBottom];
    const b1 = [cx + Math.cos(a1) * rBottom, y0, cz + Math.sin(a1) * rBottom];
    const t1 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
    const t0 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
    pushQuad(g, t0, t1, b1, b0, color);
  }
  if (!caps) return;
  if (rTop > 0) pushDisc(g, cx, y1, cz, rTop, segments, color, 1);
  if (rBottom > 0) pushDisc(g, cx, y0, cz, rBottom, segments, color, -1);
}

// A rectangular frustum. The hull is three of these stacked rather than one box: a sprayer
// this size has a chamfered belly and shoulders that the arms bolt into, and a plain box
// reads as a parcel with propellers.
function pushFrustum(g, cx, cy, cz, bw, bd, tw, td, h, color) {
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const ring = (w, d) => [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
  const b = ring(bw, bd), t = ring(tw, td);
  const P = (r, y, i) => [cx + r[i][0], y, cz + r[i][1]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    pushQuad(g, P(b, y0, i), P(b, y0, j), P(t, y1, j), P(t, y1, i), color);
  }
  pushQuad(g, P(t, y1, 0), P(t, y1, 1), P(t, y1, 2), P(t, y1, 3), color);
  pushQuad(g, P(b, y0, 3), P(b, y0, 2), P(b, y0, 1), P(b, y0, 0), color);
}

/* ---------- the aircraft ---------- */

// How far back the camera sits. Larger reads as a smaller, more distant aircraft, which is
// what keeps it crossing the page rather than blocking the copy underneath it. Raised from
// 11.5 because at that distance the aircraft was simply too tall to fit anywhere: the gap
// between the bottom of the chrome and the top of an act's content is about 130px at 900px
// tall, and the aircraft filled 125px of it. Every band that cleared the copy put its
// rotors under the header, and every band that cleared the header put its body on a
// headline. Flying it further away is the fix the comment above already prescribed.
const CAMERA_Z = 15.5;
const FOV = 0.62;

// Where the page's opaque occluding objects live, in world Z: the chrome, the plates and
// the shelf. In FRONT of the whole depth drift, so those are things the aircraft always
// passes behind, whatever it is doing.
const OCCLUDE_Z = 1.6;

// And where the page's COPY stands. This one is inside the drift on purpose: headlines and
// body text are the one set of objects the aircraft crosses in both directions, so the
// plane they stand on has to be somewhere it can get to either side of.
const TEXT_Z = 0.0;

const ARM = 0.68;        // hub to motor, along both X and Z: the frame is an X
const ROTOR_R = 0.38;    // blade half-span; twice this must stay under 2 * ARM
const SKID_Z = 0.46;

// A permanent lean toward the viewer, and it is not decoration. The view matrix is a bare
// translation, so the camera has no elevation at all: a rotor plane lying flat is exactly
// edge-on, and eight of them render as one grey rod. This opens the discs to about fourteen
// degrees, which is what makes the thing read as four coaxial pairs instead of a bar.
//
// It is applied OUTSIDE the yaw, in world space, and that is the whole trick. Leaning the
// aircraft in its own body frame looks right until it has turned a quarter turn, at which
// point the lean axis is pointing straight at the camera, rotating about it changes nothing
// anyone can see, and the discs shut again for a quarter of every revolution.
//
// It is the aircraft that leans and not the camera, because the occluder quads are projected
// into world space against an untilted view: tilting the camera would have skewed every one
// of them off the element it is standing in for.
const BASE_PITCH = 0.24;

// The aircraft's own half-extents in world units, measured off the geometry below. The
// autopilot band is built out of these rather than out of guessed fractions, so it holds at
// any viewport.
//
// X is the SWEPT radius, not the resting width: the model turns continuously about its own
// Y axis, so the widest silhouette it ever presents is the diagonal through two opposite
// rotors, hypot(ARM, ARM) + ROTOR_R = 0.962 + 0.38. Bounding it by the resting half-width
// instead let a corner rotor cross the frame edge once per revolution.
const HALF_SPAN_X = 1.35;
// Y is the skid-to-rotor stack taken AFTER the forward lean, which swings the aft rotors up
// and the forward skid down: roughly -0.51 to 0.46, plus room for the bank and pitch the
// follow adds on top.
const HALF_SPAN_Y = 0.55;

const SHELL = [0.93, 0.93, 0.95];
const SHELL_MID = [0.74, 0.76, 0.82];
const SHELL_DARK = [0.30, 0.32, 0.33];
const SIGNAL = [0.839, 0.157, 0.133]; // the page accent, the one colour that never varies
const ROTOR = [0.115, 0.125, 0.135];
const BLADE = [0.24, 0.255, 0.265];
const TANK = [0.18, 0.195, 0.20];

// The two centrifugal nozzles, under the atomiser discs at the ends of the booms. Emission
// points, not geometry: the fan leaves from just below each head.
const NOZZLES = [[-0.66, -0.37, 0.06], [0.66, -0.37, 0.06]];

// How far the visitor may fly the aircraft, as a fraction of the frustum at its own depth,
// and the dead band inside which flying is only flying.
const FLY_LIMIT_X = 0.88;
const FLY_LIMIT_Y = 0.82;
const SCROLL_DEAD = 0.34;
const SCROLL_MAX = 1200;   // CSS px per second, at full deflection

// Four arm-tip LEDs and one beacon on the spine. The arm lights sit UNDER the nav housings,
// where they are on the airframe and, less romantically, where the depth test can still see
// them: at motor height they were inside the bell and never drew a pixel.
const LED_POINTS = [
  [-ARM, -0.045, -ARM], [ARM, -0.045, -ARM], [-ARM, -0.045, ARM], [ARM, -0.045, ARM],
  [0, 0.35, 0.06],
];
const LED_GREEN = [0.16, 0.95, 0.42];
const LED_YELLOW = [1.00, 0.78, 0.16];

// Eight rotors on four arms: an Agras of this class is an octo-quad, two coaxial
// counter-rotating props per arm. [x, y, z, direction]. The two heights straddle the motor
// tower the way the real pair does, one prop above the upper can and one below the lower,
// with about a fifth of a rotor diameter between them.
const ROTOR_MOUNTS = [];
for (const sx of [1, -1]) {
  for (const sz of [1, -1]) {
    ROTOR_MOUNTS.push([sx * ARM, 0.285, sz * ARM, 1]);
    ROTOR_MOUNTS.push([sx * ARM, 0.075, sz * ARM, -1]);
  }
}

// Tubular frame members in any direction, with a stable orthonormal cross section.
// The Agras silhouette depends on the open space between these thin carbon tubes.
function pushTube(g, a, b, radius, color, segments = 10) {
  const d = b.map((v, i) => v - a[i]);
  const len = Math.hypot(...d);
  const n = d.map(v => v / len);
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = [n[1]*ref[2]-n[2]*ref[1], n[2]*ref[0]-n[0]*ref[2], n[0]*ref[1]-n[1]*ref[0]];
  const ul = Math.hypot(...u);
  for (let i = 0; i < 3; i++) u[i] /= ul;
  const v = [n[1]*u[2]-n[2]*u[1], n[2]*u[0]-n[0]*u[2], n[0]*u[1]-n[1]*u[0]];
  const point = (p, angle) => p.map((x, i) => x + radius * (u[i]*Math.cos(angle) + v[i]*Math.sin(angle)));
  for (let i = 0; i < segments; i++) {
    const t = i * Math.PI * 2 / segments, next = (i + 1) * Math.PI * 2 / segments;
    pushQuad(g, point(a,t), point(a,next), point(b,next), point(b,t), color);
  }
}

function buildDrone() {
  const g = { pos: [], nrm: [], col: [] };

  // T50 reference: pale removable tank behind the upright battery, graphite chassis,
  // four folding carbon arms and eight coaxial propellers. No external model or textures.
  pushFrustum(g, 0, -0.225, -0.045, 0.29, 0.27, 0.46, 0.44, 0.13, SHELL_MID);
  pushFrustum(g, 0, -0.085, -0.065, 0.46, 0.44, 0.52, 0.48, 0.15, SHELL);
  pushFrustum(g, 0, 0.075, -0.105, 0.52, 0.44, 0.49, 0.40, 0.17, SHELL);
  pushFrustum(g, 0, 0.185, -0.105, 0.49, 0.40, 0.34, 0.32, 0.05, SHELL);
  pushCyl(g, 0, 0.223, -0.19, 0.06, 0.055, 0.025, 12, TANK);
  // Recessed tank ribs, visible on both flanks.
  for (const sx of [-1, 1]) {
    for (const z of [-0.19, -0.07, 0.05]) {
      pushBeam(g, sx*0.237, -0.16, z, sx*0.264, -0.005, z-0.025, 0.013, 0.016, SHELL_MID);
    }
  }

  pushFrustum(g, 0, 0.025, 0.13, 0.54, 0.29, 0.48, 0.27, 0.12, SHELL_DARK);
  pushFrustum(g, 0, 0.105, 0.145, 0.48, 0.27, 0.32, 0.23, 0.04, SHELL_MID);
  // Tall battery and a genuinely open carrying handle.
  pushFrustum(g, 0, 0.215, 0.105, 0.20, 0.20, 0.16, 0.17, 0.20, SHELL_DARK);
  pushBox(g, 0, 0.32, 0.105, 0.18, 0.022, 0.18, TANK);
  for (const x of [-0.06, 0.06]) pushBox(g, x, 0.343, 0.105, 0.018, 0.045, 0.025, ROTOR);
  pushBox(g, 0, 0.365, 0.105, 0.138, 0.018, 0.025, ROTOR);
  // Front radar, binocular camera windows and downward sensor.
  pushFrustum(g, 0, 0.005, 0.292, 0.25, 0.06, 0.28, 0.05, 0.08, TANK);
  for (const x of [-0.15, 0.15]) {
    pushBox(g, x, 0.071, 0.274, 0.075, 0.04, 0.015, ROTOR);
    for (const dx of [-0.018, 0.018]) pushBox(g, x+dx, 0.073, 0.284, 0.018, 0.017, 0.005, SHELL_MID);
  }
  pushBox(g, 0, -0.27, 0.15, 0.12, 0.05, 0.09, TANK);
  pushBox(g, 0, 0.05, -0.335, 0.22, 0.07, 0.06, TANK);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = sx * ARM, tz = sz * ARM;
      pushBeam(g, sx*0.18, 0.035, sz*0.16, sx*0.32, 0.045, sz*0.30, 0.105, 0.08, TANK);
      pushCyl(g, sx*0.30, 0.05, sz*0.28, 0.045, 0.045, 0.105, 12, ROTOR);
      pushTube(g, [sx*0.30, 0.05, sz*0.29], [tx, 0.07, tz], 0.029, ROTOR);
      pushTube(g, [sx*0.32, 0.05, sz*0.31], [sx*0.39, 0.054, sz*0.38], 0.034, SHELL_MID);
      pushCyl(g, tx, 0.17, tz, 0.068, 0.073, 0.15, 12, TANK);
      pushCyl(g, tx, 0.25, tz, 0.073, 0.046, 0.025, 12, ROTOR);
      pushCyl(g, tx, 0.279, tz, 0.026, 0.026, 0.04, 12, SHELL_MID);
      pushCyl(g, tx, 0.074, tz, 0.044, 0.062, 0.042, 12, ROTOR);
      pushBox(g, tx, -0.015, tz, 0.05, 0.05, 0.05, TANK);
      // Fine cooling fins distinguish the motor cans from the arm tubes.
      for (const y of [0.12, 0.15, 0.18, 0.21]) pushCyl(g, tx, y, tz, 0.075, 0.075, 0.006, 12, SHELL_DARK);
    }
    // Open tubular landing loops, fore-aft, with raised ends and broad stance.
    const points = [[sx*0.22,-0.06,-0.25], [sx*0.35,-0.38,-SKID_Z],
      [sx*0.34,-0.425,-0.35], [sx*0.34,-0.425,0.35],
      [sx*0.35,-0.38,SKID_Z], [sx*0.22,-0.06,0.25]];
    for (let i=0; i<points.length-1; i++) pushTube(g, points[i], points[i+1], 0.018, ROTOR);
    pushTube(g, [sx*0.34,-0.425,-0.26], [sx*0.34,-0.425,0.26], 0.023, TANK);
    // Pump, plumbing and centrifugal atomiser at the actual particle origin.
    pushTube(g, [sx*0.13,-0.25,0.02], [sx*0.66,-0.27,0.06], 0.015, ROTOR);
    pushCyl(g, sx*0.66, -0.305, 0.06, 0.045, 0.039, 0.10, 12, SHELL_DARK);
    pushDisc(g, sx*0.66, -0.358, 0.06, 0.061, 16, ROTOR, -1);
    pushBox(g, sx*0.29, 0.09, 0.28, 0.035, 0.012, 0.05, SIGNAL);
  }
  pushBox(g, 0, -0.295, -0.015, 0.18, 0.045, 0.12, TANK);
  return g;
}

// One blade, from the hub out along +X or -X. Four stations rather than a stick: a real
// prop is widest around 40 percent of its span and tapers to almost nothing at the tip, and
// it cones upward under load. Reversing the vertex order for the opposite blade is what
// keeps the top face of both of them facing up: pushQuad takes its normal off its own
// edges, and the edge that runs outboard changes sign with the blade.
function pushBlade(g, s, color) {
  const st = [
    [0.045, 0.034, 0.000],
    [ROTOR_R * 0.42, 0.062, 0.012],
    [ROTOR_R * 0.80, 0.056, 0.024],
    [ROTOR_R, 0.022, 0.032],
  ];
  const th = 0.009;
  const P = (i, chord, up) => [s * st[i][0], st[i][2] + up * th, chord * st[i][1]];
  const q = (a, b, c, d) => (s > 0 ? pushQuad(g, a, b, c, d, color) : pushQuad(g, d, c, b, a, color));
  for (let i = 0; i < st.length - 1; i++) {
    const j = i + 1;
    q(P(i, -1, 1), P(i, 1, 1), P(j, 1, 1), P(j, -1, 1));        // top
    q(P(i, -1, -1), P(j, -1, -1), P(j, 1, -1), P(i, 1, -1));    // bottom
    q(P(i, 1, 1), P(i, 1, -1), P(j, 1, -1), P(j, 1, 1));        // trailing edge
    q(P(i, -1, -1), P(i, -1, 1), P(j, -1, 1), P(j, -1, -1));    // leading edge
  }
  const n = st.length - 1;
  q(P(n, -1, 1), P(n, 1, 1), P(n, 1, -1), P(n, -1, -1));        // tip cap
}

// One rotor, centred on its own mast so it can be spun about it. Two blades rather than a
// filled disc: the disc could not turn, and a prop that does not turn is the first thing
// anyone notices.
function buildRotor() {
  const g = { pos: [], nrm: [], col: [] };
  // Open propeller silhouette: an opaque swept disc hides the coaxial airframe.
  pushCyl(g, 0, 0.005, 0, 0.058, 0.044, 0.05, 8, ROTOR);
  for (const s of [1, -1]) pushBlade(g, s, BLADE);
  return g;
}

/* ---------- the status lights ---------- */

// The power-on the real hardware performs, in the order it performs it. From DJI's own
// status-indicator table: alternating red / green / yellow while it runs its self
// diagnostics, four yellow blinks while it warms up, then solid green once the link is up.
// Slow green after that means GNSS is enabled, which is what it is doing the whole time it
// is flying itself.
const LINK_STEPS = [['selftest', 0.9], ['warmup', 1.0], ['linked', 0.6]];

/* ---------- particles ---------- */

const MAX_PARTICLES = 420;
const MAX_SPLATS = 400;

// How long a mark stays on the glass, in seconds. Long enough to build a pass into
// something worth looking at, short enough that a visitor who wandered off and came back is
// not reading this page through last minute's paint.
const SPLAT_LIFE = [4.5, 7.5];

// One droplet in four leaves a mark, and that ratio is set by the two numbers above rather
// than by taste. The booms throw about 240 droplets a second; at a mark each, the ring
// buffer would turn over in a second and the paint would be gone long before it dried,
// which would make the timer above a decoration. At one in four the buffer holds roughly
// the whole of a mark's life, so what takes paint off this page is the drying and nothing
// else.
const LAND_EVERY = 4;

// Multicolour, and that is a decision about what this page is rather than about what a
// sprayer is. Real tank mix is one colour and it is usually the colour of water. This is a
// toy on a portfolio, the visitor just took the controls, and what they get for it is
// paint. The hue advances by the golden angle every droplet, so consecutive droplets are
// never neighbours on the wheel and the fan comes out as a spread rather than as a gradient
// that has to loop back on itself.
const HUE_STEP = 0.381966;

// HSL(h, 0.95, 0.56) to RGB, written out rather than pulled from a helper: it runs per
// droplet and it is the only colour conversion in this file. Saturated, and sitting just
// above the middle in lightness, because these land on the code world's near-black ground
// as often as on the sky world's paper and have to hold up on both. Pastel disappears into
// the paper; a dark mid-tone disappears into the code ground.
function hueToRGB(h, out, o) {
  const t = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * 0.56 - 1)) * 0.95;
  const x = c * (1 - Math.abs(((t * 6) % 2) - 1));
  const m = 0.56 - c / 2;
  const seg = Math.floor(t * 6) % 6;
  const r = seg === 0 || seg === 5 ? c : seg === 1 || seg === 4 ? x : 0;
  const g = seg === 1 || seg === 2 ? c : seg === 0 || seg === 3 ? x : 0;
  const b = seg === 3 || seg === 4 ? c : seg === 2 || seg === 5 ? x : 0;
  out[o] = r + m;
  out[o + 1] = g + m;
  out[o + 2] = b + m;
}

class Spray {
  constructor() {
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    // Whether this droplet is tank mix or rotor wash. Wash is the kick-up from moving the
    // aircraft hard and it leaves nothing behind; only a droplet the visitor deliberately
    // sprayed lands as paint.
    this.wet = new Uint8Array(MAX_PARTICLES);
    this.head = 0;
    this.hue = 0;
  }
  // From a nozzle, along the boom. A centrifugal nozzle throws a flat fan on the boom axis
  // rather than a cone straight down, which is why the axis has to come in from the caller:
  // the aircraft is turning, so the fan turns with it.
  emit(p, axis, seed, wet) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    // Deterministic-ish jitter from a seed keeps this free of Math.random churn.
    const a = seed * 2.399963;
    const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    const ax = axis[0] / len, az = axis[2] / len;
    const fan = Math.sin(a) * 0.5;
    const cross = Math.cos(a) * 0.14;
    this.pos[i * 3] = p[0] + ax * fan * 0.2;
    this.pos[i * 3 + 1] = p[1];
    this.pos[i * 3 + 2] = p[2] + az * fan * 0.2;
    this.vel[i * 3] = ax * fan - az * cross;
    this.vel[i * 3 + 1] = -1.7;
    this.vel[i * 3 + 2] = az * fan + ax * cross;
    this.life[i] = 1;
    this.wet[i] = wet ? 1 : 0;
    if (wet) {
      this.hue += HUE_STEP;
      hueToRGB(this.hue, this.col, i * 3);
    } else {
      // Wash is the aircraft's own colour of dust, not paint.
      this.col[i * 3] = 0.78; this.col[i * 3 + 1] = 0.80; this.col[i * 3 + 2] = 0.86;
    }
  }
  // `land` is called once for every tank-mix droplet at the moment it runs out, with its
  // index. That is where the paint comes from: the droplet does not vanish, it arrives.
  step(dt, land) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      // Tank mix hangs in the air longer than rotor wash does, which is most of what makes
      // a spray pass read as a curtain rather than as a puff under the aircraft.
      this.life[i] -= dt * (this.wet[i] ? 0.85 : 1.5);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= dt * 1.2;
      if (this.life[i] <= 0 && this.wet[i] && land) land(i);
    }
  }
}

// The marks left on the page. A ring buffer with a hard cap, so a visitor who holds the
// spray on for a minute gets the last 260 marks and never a growing array: the oldest is
// overwritten, which reads as the first paint having dried first, which is what it is.
//
// The two coordinates are deliberately in different spaces. Nothing on this page scrolls
// sideways, so X can stay in clip space and never needs converting. Y is the one the page
// moves under, so it is held as CSS pixels DOWN THE DOCUMENT and converted at draw time.
class Splats {
  constructor() {
    this.x = new Float32Array(MAX_SPLATS);      // clip space, -1 to 1
    this.docY = new Float32Array(MAX_SPLATS);   // CSS px from the top of the document
    this.col = new Float32Array(MAX_SPLATS * 3);
    this.life = new Float32Array(MAX_SPLATS);   // 1 down to 0
    this.rate = new Float32Array(MAX_SPLATS);   // 1 / seconds of life
    this.size = new Float32Array(MAX_SPLATS);   // device pixels
    this.head = 0;
  }
  add(x, docY, r, g, b, size, ttl) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_SPLATS;
    this.x[i] = x;
    this.docY[i] = docY;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = 1;
    this.rate[i] = 1 / ttl;
    this.size[i] = size;
  }
  step(dt) {
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * this.rate[i];
      // Drying spreads the mark a little before it goes, the way a drop of water does.
      this.size[i] += dt * 1.6;
    }
  }
  clear() { this.life.fill(0); }
}

/* ---------- the scene ---------- */

export class Drone {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,   // the aliasing is the aesthetic
      premultipliedAlpha: false,
    });
    if (!this.gl) throw new Error('WebGL unavailable');

    this.armed = false;
    this.spraying = false;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Resting depth is BEHIND the copy's plane, and that is for the visitor who asked for
    // reduced motion: they get no depth drift at all, so wherever this starts is where the
    // aircraft stays, and station-keeping in the middle of the frame is station-keeping on
    // a headline. Behind it, the copy is over the aircraft and stays entirely readable.
    this.pos = { x: 0, y: 0.4, z: -0.7 };
    this.target = { x: 0, y: 0.4 };
    this.vel = { x: 0, y: 0 };
    this.spin = 0;
    this.t = 0;
    this.frame = 0;
    this.keys = new Set();
    this.spray = new Spray();
    this.splats = new Splats();
    this.landed = 0;            // counts droplets toward the next mark, see LAND_EVERY
    this.running = false;

    // The F key, the controller's dial and the switch in the chrome are three ways of asking
    // the aircraft the same question, so the aircraft owns the answer and all three follow
    // it. Anything that wants to draw the state subscribes; nothing gets to hold its own.
    this.sprayWatchers = new Set();

    // Set by the page once it has a sound engine. Null is the normal case, and every call
    // below is optional-chained, so nothing here needs to know whether anyone is listening.
    this.sound = null;

    // Vertical input, and the sub-pixel remainder of the page scroll it drives.
    this.climb = 0;
    this.scrollAcc = 0;

    // Where the page is, refreshed once a frame in step(). The paint is anchored to the
    // document, so both landing a mark and drawing one need this. Zero until the first
    // frame, which is correct: the page has not scrolled yet.
    this.scrollY = 0;

    // The status sequence. `gnss` is the resting state: it has a satellite fix and it is
    // flying itself. Arming runs the real power-on through LINK_STEPS and comes back here.
    this.link = 'gnss';
    this.linkT = 0;
    this.linkStep = -1;

    // One coverage mask per crossable element, keyed by the element. Baking one costs a
    // rasterise and a texture upload, so they are kept until the cache is full rather than
    // rebuilt every time an element scrolls back into view.
    this.masks = new Map();
    this.fontsReady = !document.fonts;
    document.fonts?.ready.then(() => { this.fontsReady = true; });

    this._initGL();
    this._watchOccluders();
    this._bindInput();
  }

  _compile(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _initGL() {
    const gl = this.gl;
    this.prog = this._compile(VERT, FRAG);
    this.pProg = this._compile(PARTICLE_VERT, PARTICLE_FRAG);
    this.sProg = this._compile(SPLAT_VERT, SPLAT_FRAG);
    this.lProg = this._compile(LIGHT_VERT, LIGHT_FRAG);
    this.oProg = this._compile(OCCLUDE_VERT, OCCLUDE_FRAG);
    this.mProg = this._compile(MASK_VERT, MASK_FRAG);

    const buf = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };

    // Two static sets: the airframe, drawn once, and one rotor, drawn eight times with its
    // own model matrix so each can turn, and each coaxial pair can turn against the other.
    const body = buildDrone();
    this.vertexCount = body.pos.length / 3;
    this.bPos = buf(body.pos);
    this.bNrm = buf(body.nrm);
    this.bCol = buf(body.col);

    const rotor = buildRotor();
    this.rotorCount = rotor.pos.length / 3;
    this.rPos = buf(rotor.pos);
    this.rNrm = buf(rotor.nrm);
    this.rCol = buf(rotor.col);

    this.bPPos = gl.createBuffer();
    this.bPLife = gl.createBuffer();
    this.bPCol = gl.createBuffer();
    this.bSNDC = gl.createBuffer();
    this.bSCol = gl.createBuffer();
    this.bSLife = gl.createBuffer();
    this.bSSize = gl.createBuffer();
    this.bLPos = gl.createBuffer();
    this.bOPos = gl.createBuffer();
    this.bMPos = gl.createBuffer();
    this.bMUV = gl.createBuffer();

    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aNormal: gl.getAttribLocation(this.prog, 'aNormal'),
      aColor: gl.getAttribLocation(this.prog, 'aColor'),
      uProj: gl.getUniformLocation(this.prog, 'uProj'),
      uView: gl.getUniformLocation(this.prog, 'uView'),
      uModel: gl.getUniformLocation(this.prog, 'uModel'),
      uNormalMat: gl.getUniformLocation(this.prog, 'uNormalMat'),
      uAlpha: gl.getUniformLocation(this.prog, 'uAlpha'),
    };
    this.pLoc = {
      aPos: gl.getAttribLocation(this.pProg, 'aPos'),
      aLife: gl.getAttribLocation(this.pProg, 'aLife'),
      aTint: gl.getAttribLocation(this.pProg, 'aTint'),
      uProj: gl.getUniformLocation(this.pProg, 'uProj'),
      uView: gl.getUniformLocation(this.pProg, 'uView'),
    };
    this.sLoc = {
      aNDC: gl.getAttribLocation(this.sProg, 'aNDC'),
      aTint: gl.getAttribLocation(this.sProg, 'aTint'),
      aLife: gl.getAttribLocation(this.sProg, 'aLife'),
      aSize: gl.getAttribLocation(this.sProg, 'aSize'),
    };
    this.lLoc = {
      aPos: gl.getAttribLocation(this.lProg, 'aPos'),
      uProj: gl.getUniformLocation(this.lProg, 'uProj'),
      uView: gl.getUniformLocation(this.lProg, 'uView'),
      uColor: gl.getUniformLocation(this.lProg, 'uColor'),
      uIntensity: gl.getUniformLocation(this.lProg, 'uIntensity'),
      uSize: gl.getUniformLocation(this.lProg, 'uSize'),
    };
    this.oLoc = {
      aPos: gl.getAttribLocation(this.oProg, 'aPos'),
      uProj: gl.getUniformLocation(this.oProg, 'uProj'),
      uView: gl.getUniformLocation(this.oProg, 'uView'),
    };
    this.mLoc = {
      aPos: gl.getAttribLocation(this.mProg, 'aPos'),
      aUV: gl.getAttribLocation(this.mProg, 'aUV'),
      uProj: gl.getUniformLocation(this.mProg, 'uProj'),
      uView: gl.getUniformLocation(this.mProg, 'uView'),
      uMask: gl.getUniformLocation(this.mProg, 'uMask'),
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / h;
    this.dpr = dpr;
    // Every mask was rasterised against a layout that no longer exists: the copy has
    // rewrapped, so the glyphs are somewhere else inside the element's rect.
    this._dropMasks();
  }

  /* ---------- occluders ---------- */

  // The page objects the aircraft has depth against. There are two kinds and they are not
  // the same promise:
  //
  //   data-drone="behind"  an opaque rectangle it always passes behind: the chrome, the
  //                        three plates, the shelf. Their quads sit at OCCLUDE_Z, in front
  //                        of the whole depth drift, so the answer never changes.
  //   data-drone="cross"   copy it passes both over AND under: headlines, body text, the
  //                        title-card words. Their quads sit at TEXT_Z, inside the drift,
  //                        so which side it is on is a question the depth buffer answers
  //                        differently every few seconds.
  //
  // Everything else it passes in front of, including every ground: it has to stay visible
  // the whole way down for the handover's own line about it to be true.
  //
  // An IntersectionObserver keeps the live sets, so nothing is measured for an element that
  // is not on screen and no scroll listener is involved. The rects themselves are read once
  // per frame from inside the animation frame, which is what js/clouds.js does for the same
  // reason: it is a read with no write after it, so it costs one layout at most and never a
  // synchronous reflow.
  _watchOccluders() {
    this.occluders = new Set();
    this.crossers = new Map();   // element -> the clock reading when it came into view
    const nodes = document.querySelectorAll('[data-drone]');
    if (!nodes.length || !('IntersectionObserver' in window)) return;
    this._io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const cross = e.target.dataset.drone === 'cross';
        if (e.isIntersecting) {
          if (cross) { if (!this.crossers.has(e.target)) this.crossers.set(e.target, this.t); }
          else this.occluders.add(e.target);
        } else {
          if (cross) this.crossers.delete(e.target);
          else this.occluders.delete(e.target);
        }
      }
    });
    for (const n of nodes) this._io.observe(n);

    // A mask is only as good as the text it was rasterised off, and the copy on this page
    // is not static while it enters: the article headings decode out of scrambled glyphs,
    // which means an element can be settled in its layout and still be showing letters it
    // is about to stop showing. A mutation drops that element's mask and restarts its
    // settle timer, so the bake lands 0.7s after the copy stops changing rather than 0.7s
    // after it appeared. It is also what would carry a language switch, if switching ever
    // stops reloading the page.
    this._mo = new MutationObserver((records) => {
      for (const rec of records) {
        const node = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement;
        const el = node?.closest('[data-drone="cross"]');
        if (!el) continue;
        const mask = this.masks.get(el);
        if (mask) {
          this.gl.deleteTexture(mask.tex);
          this.masks.delete(el);
        }
        if (this.crossers.has(el)) this.crossers.set(el, this.t);
      }
    });
    for (const n of nodes) {
      if (n.dataset.drone !== 'cross') continue;
      this._mo.observe(n, { subtree: true, childList: true, characterData: true });
    }
  }

  // An element's painted rect in viewport pixels, clipped to the act that owns it and then
  // to the viewport. Acts are overflow: hidden, so an element's own rect can run past what
  // is actually on screen, and a quad projected from the unclipped rect would occlude the
  // aircraft against copy that is not being painted at all.
  _visibleRect(el) {
    const r = el.getBoundingClientRect();
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    const act = el.closest('.act');
    if (act) {
      const a = act.getBoundingClientRect();
      l = Math.max(l, a.left); t = Math.max(t, a.top);
      rr = Math.min(rr, a.right); b = Math.min(b, a.bottom);
    }
    l = Math.max(l, 0); t = Math.max(t, 0);
    rr = Math.min(rr, window.innerWidth); b = Math.min(b, window.innerHeight);
    if (rr <= l || b <= t) return null;
    return { rect: r, l, t, r: rr, b };
  }

  // Viewport rects, as world quads on the occluder plane. Only rectangular, opaquely
  // painted elements may opt into this one: it writes depth over the whole rect, so a
  // transparent one would swallow the aircraft into a hole with nothing visible in front
  // of it. Copy opts into the masked path below instead.
  _occluderQuads() {
    const out = [];
    if (!this.occluders?.size) return out;
    const per = (2 * this.halfHeightAt(OCCLUDE_Z)) / window.innerHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    for (const el of this.occluders) {
      const v = this._visibleRect(el);
      if (!v) continue;
      const x0 = (v.l - vw / 2) * per, x1 = (v.r - vw / 2) * per;
      const y0 = (vh / 2 - v.b) * per, y1 = (vh / 2 - v.t) * per;
      out.push(
        x0, y0, OCCLUDE_Z, x1, y0, OCCLUDE_Z, x1, y1, OCCLUDE_Z,
        x0, y0, OCCLUDE_Z, x1, y1, OCCLUDE_Z, x0, y1, OCCLUDE_Z,
      );
    }
    return out;
  }

  /* ---------- the copy's coverage masks ---------- */

  // How long an element must have been on screen before its mask is baked, and how many
  // masks are kept. The delay is not politeness: acts enter on a transform and the name
  // rises inside its own clipped line, so a mask taken on the first frame an element is
  // visible records the glyphs where they were passing through, not where they land.
  //
  // The mask is baked in ELEMENT-LOCAL coordinates, so scrolling never invalidates it: the
  // quad moves with the element and the glyphs move with the quad. Only a reflow does, and
  // the two that can happen here are a resize and a rewrap, both of which change the rect.
  _maskFor(el) {
    const cached = this.masks.get(el);
    const r = el.getBoundingClientRect();
    if (cached && Math.abs(cached.w - r.width) < 0.75 && Math.abs(cached.h - r.height) < 0.75) {
      cached.used = this.t;
      return cached;
    }
    if (!this.fontsReady) return null;                       // a fallback face would mis-set
    if (this.t - (this.crossers.get(el) ?? this.t) < 0.7) return null;
    if (r.width < 8 || r.height < 8) return null;
    // One bake per frame at most. Rasterising a whole act's copy is a millisecond or two,
    // and three acts entering together is exactly the moment that must not drop a frame.
    if (this._bakeBudget <= 0) return null;
    this._bakeBudget--;
    if (cached) this.gl.deleteTexture(cached.tex);
    const baked = this._bakeMask(el, r);
    if (baked) this.masks.set(el, baked);
    else this.masks.delete(el);
    this._sweepMasks();
    return baked;
  }

  // Rasterise the element's text into a coverage bitmap the size of its own rect.
  //
  // Word by word, off Range rects rather than off a re-implementation of line breaking:
  // the browser has already decided where every word sits, and asking it is the only way
  // the mask can be trusted to land on the glyphs at any viewport, in any of the three
  // languages, in a face whose metrics this file knows nothing about. The strings are then
  // drawn with the element's own computed font, which is exact here because both variable
  // faces are pinned to their own default instance in the stylesheet and a canvas cannot
  // set a variation axis.
  _bakeMask(el, rect) {
    const gl = this.gl;
    const scale = Math.min(this.dpr || 1, 2, 1600 / Math.max(rect.width, rect.height, 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(rect.width * scale));
    c.height = Math.max(1, Math.ceil(rect.height * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.translate(-rect.left, -rect.top);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    // The mask is drawn a hair fat. A sliver of aircraft showing through the inside of a
    // letter would be read as a rendering fault; a sliver of letter that hides a little
    // more aircraft than it should is read as nothing at all.
    ctx.lineWidth = 1.6;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let drew = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim()) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in ctx) {
        ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      }
      drew += this._maskNode(ctx, node, cs.textTransform);
    }
    if (!drew) return null;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // The 2D canvas runs top down and the quad's V runs bottom up.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // No mipmaps and clamped: these are never power of two, and WebGL 1 only allows a
    // non-power-of-two texture at all on exactly these parameters.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, w: rect.width, h: rect.height, words: drew, used: this.t };
  }

  // One text node, word by word. A word that comes back with more than one rect broke
  // across a line, so it is redrawn a character at a time and each piece lands on the line
  // the browser actually put it on.
  _maskNode(ctx, node, transform) {
    const raw = node.nodeValue;
    const cased = (s) => (
      transform === 'uppercase' ? s.toUpperCase()
      : transform === 'lowercase' ? s.toLowerCase()
      : transform === 'capitalize' ? s.replace(/^\p{L}/u, (ch) => ch.toUpperCase())
      : s
    );
    let drew = 0;
    for (const m of raw.matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      if (rects.length === 1) {
        drew += this._maskWord(ctx, cased(m[0]), rects[0]);
        continue;
      }
      for (let i = 0; i < m[0].length; i++) {
        const one = document.createRange();
        one.setStart(node, m.index + i);
        one.setEnd(node, m.index + i + 1);
        const rr = one.getClientRects();
        if (rr.length === 1) drew += this._maskWord(ctx, cased(m[0][i]), rr[0]);
      }
    }
    return drew;
  }

  // The baseline is taken as a PROPORTION of the range's own box rather than by adding the
  // measured ascent to its top. The two agree when the canvas and the layout resolved the
  // same face, and when they do not the proportion still puts the mask on the line instead
  // of somewhere below it.
  _maskWord(ctx, word, rect) {
    if (!word || rect.width <= 0 || rect.height <= 0) return 0;
    const m = ctx.measureText(word);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? 0;
    const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? 0;
    const y = asc + desc > 0 ? rect.top + rect.height * (asc / (asc + desc)) : rect.bottom;
    ctx.strokeText(word, rect.left, y);
    ctx.fillText(word, rect.left, y);
    return 1;
  }

  // A small cache with a hard cap. Masks for copy that is still on screen are never the
  // ones dropped: the aircraft is over them right now.
  _sweepMasks(limit = 12) {
    while (this.masks.size > limit) {
      let oldest = null;
      for (const [el, mask] of this.masks) {
        if (this.crossers?.has(el)) continue;
        if (!oldest || mask.used < oldest[1].used) oldest = [el, mask];
      }
      if (!oldest) return;
      this.gl.deleteTexture(oldest[1].tex);
      this.masks.delete(oldest[0]);
    }
  }

  _dropMasks() {
    if (!this.masks) return;
    for (const mask of this.masks.values()) this.gl.deleteTexture(mask.tex);
    this.masks.clear();
  }

  /* ---------- input ---------- */

  // Keyboard only, on the window. Nothing is bound to the canvas: see the note at the top
  // of this file for why it must never take a pointer event.
  _bindInput() {
    const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    this._onKeyDown = (e) => {
      if (!this.armed) return;
      const k = e.key.toLowerCase();
      if (MOVE.includes(k)) {
        this.keys.add(k);
        e.preventDefault();
        return;
      }
      // The spray. F rather than the space bar: the arrows are already spent on flying, and
      // taking scrolling away from a keyboard-only visitor as well is a bigger bill than the
      // spray is worth. A press that landed on a control is left to that control.
      if (k === 'f' && !e.repeat && !e.target?.closest?.('button, a, input, select, textarea')) {
        this.setSpraying(!this.spraying);
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', () => this.resize());
  }

  /* ---------- frustum ---------- */

  // Half-extents of the camera frustum at a given world depth. The view is a bare
  // translation with no rotation, so screen and world stay linearly related on both axes
  // and the only thing depth changes is the scale.
  halfHeightAt(z) { return Math.tan(FOV / 2) * (CAMERA_Z - z); }
  halfWidthAt(z) { return this.halfHeightAt(z) * (this.aspect || 1.6); }
  halfHeight() { return this.halfHeightAt(0); }
  halfWidth() { return this.halfWidthAt(0); }

  // World-space Y of the first row the aircraft may occupy: the underside of the fixed
  // chrome bar. Read from the element so the two cannot drift apart, and so the phone
  // breakpoint's shorter bar is respected without repeating its height here.
  ceilingY(z = 0) {
    const bar = document.querySelector('.chrome')?.getBoundingClientRect().height ?? 56;
    const px = window.innerHeight / 2 - bar;                 // px from centre to bar bottom
    return (px / (window.innerHeight / 2)) * this.halfHeightAt(z);
  }

  /* ---------- state ---------- */

  // Handing over the controls changes what the keys do and nothing else. The canvas keeps
  // its pointer-events: none and never gets a tabindex: it is not a control, the controller
  // in the handover act is, and this canvas sits over every other control on the page.
  //
  // The link sequence below is lights and copy only. Arming is immediate, on this tick, or
  // the visitor would press the button and get a drone that does not answer for two and a
  // half seconds.
  arm() {
    if (this.armed) return;
    this.armed = true;
    this.linkStep = 0;
    this.linkT = 0;
    this.link = LINK_STEPS[0][0];
    this.sound?.cue(this.link);
    this.onLink?.(this.link);
  }

  // Reduced motion says no here rather than at every call site, so there is one place in
  // this file that decides whether the booms are allowed to open. Turning the spray off
  // leaves the paint that is already down: it dries on its own timer, and wiping the glass
  // on a switch would make the marks look like a rendering artefact rather than paint.
  setSpraying(on) {
    const next = !!on && !this.reduced;
    if (next === this.spraying) return;
    this.spraying = next;
    this.sound?.spray(next);
    for (const fn of this.sprayWatchers) fn(next);
  }

  // Subscribe to the spray. Returns nothing to unsubscribe with, because every subscriber on
  // this page lives as long as the page does.
  watchSpray(fn) {
    this.sprayWatchers.add(fn);
    fn(this.spraying);
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.step(dt);
      this.draw();
      // The page scroll is written AFTER the draw, and that ordering is the whole reason it
      // is a separate call. draw() reads the occluders' rects; scrolling is a layout write.
      // Doing them the other way round is a read straight after a write on every single
      // frame the visitor is climbing, which is the one thing this module has always
      // promised not to do.
      this._applyScroll();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  step(dt) {
    this.t += dt;
    this.frame++;
    if (!this.reduced) this.spin += dt * 34;

    // The one place the page scroll is read, and it is read HERE: before draw() reads the
    // occluders' rects and well before _applyScroll() writes a new one. Every mark that
    // lands this frame and every mark that draws this frame sees the same page.
    this.scrollY = window.scrollY;

    // The power-on sequence advances on its own clock and settles back into `gnss`.
    if (this.linkStep >= 0) {
      this.linkT += dt;
      if (this.linkT >= LINK_STEPS[this.linkStep][1]) {
        this.linkT = 0;
        this.linkStep++;
        this.link = this.linkStep >= LINK_STEPS.length
          ? (this.linkStep = -1, 'gnss')
          : LINK_STEPS[this.linkStep][0];
        this.sound?.cue(this.link);
        this.onLink?.(this.link);
      }
    }

    // Depth. A slow drift in front of and behind the drone's own resting plane, which is
    // what gives the occluders something to bite on and the aircraft a sense of distance.
    //
    // It stays behind OCCLUDE_Z at every point of the cycle, so the chrome, the plates and
    // the shelf are things it always passes behind, whatever this sine is doing. It crosses
    // TEXT_Z twice a cycle, which is the opposite arrangement and the deliberate one: the
    // page's copy is the one set of objects it goes both over and under, and this is the
    // only thing that decides which. Forty-eight seconds a lap, so a visitor who stops on
    // an act sees it change sides rather than a strobe.
    if (!this.reduced) this.pos.z = -0.1 + 0.9 * Math.sin(this.t * 0.13);

    if (this.armed) {
      const speed = 9;
      let kx = 0, ky = 0;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (this.keys.has('w') || this.keys.has('arrowup')) ky += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) ky -= 1;
      if (kx || ky) {
        this.target.x += kx * speed * dt;
        this.target.y += ky * speed * dt;
      }
      this.climb = ky;
      // Clamped at the aircraft's own depth: the frustum is narrower nearer the camera, so
      // clamping against the z=0 frustum would walk it out of frame on the near half of
      // the drift.
      const hw = this.halfWidthAt(this.pos.z) * FLY_LIMIT_X;
      const hh = this.halfHeightAt(this.pos.z) * FLY_LIMIT_Y;
      this.target.x = Math.max(-hw, Math.min(hw, this.target.x));
      this.target.y = Math.max(-hh, Math.min(hh, this.target.y));
    } else {
      this.climb = 0;
    }

    if (!this.armed && !this.reduced) {
      // Autopilot. A slow lissajous so the aircraft crosses the page rather than orbiting.
      //
      // The band is expressed against the aircraft's own extents rather than as a bare
      // fraction of the frustum, because the frustum is far narrower on a phone: 0.66 of
      // halfWidth left a 390px viewport with less room on each side than the aircraft is
      // wide, and flew it half out of frame at both ends of every sweep.
      const z = this.pos.z;
      const swing = Math.max(0, this.halfWidthAt(z) - HALF_SPAN_X);
      this.target.x = Math.sin(this.t * 0.31) * swing;

      // The ceiling is not the underside of the chrome. The chrome opts into occlusion, so
      // the aircraft can climb past it and be cut off by the bar rather than clipped by it,
      // which is the whole point: it reads as passing behind the header and coming back
      // out. Before the occluders existed this was just decapitation, and it is recorded in
      // GATES.md as a defect.
      //
      // The FLOOR is the change the copy masks paid for. It used to stop well above where
      // headlines sit, because an aircraft on a headline was the one failure the band
      // existed to prevent and it is a failure downward. The copy now occludes glyph by
      // glyph, so the aircraft can go down and cross it: sometimes behind the letterforms,
      // sometimes in front of them, depending on where the depth drift has it.
      //
      // The dive is raised to a power so the curve is not a metronome. It holds up under
      // the chrome for most of the cycle and drops through the copy in the last third of
      // it: a pass, not a hover, and never a park on something someone is reading.
      const high = this.ceilingY(z) - HALF_SPAN_Y + this.halfHeightAt(z) * 0.075;
      const low = -this.halfHeightAt(z) * 0.08;
      const dive = (0.5 - 0.5 * Math.cos(this.t * 0.16)) ** 2.4;
      this.target.y = high + (low - high) * dive;
    }

    // Critically-damped-ish follow. The residual velocity is what drives the body tilt.
    const k = this.armed ? 3.4 : 1.5;
    const nx = this.pos.x + (this.target.x - this.pos.x) * Math.min(1, k * dt);
    const ny = this.pos.y + (this.target.y - this.pos.y) * Math.min(1, k * dt);
    this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-4);
    this.vel.y = (ny - this.pos.y) / Math.max(dt, 1e-4);
    this.pos.x = nx;
    this.pos.y = ny;

    if (this.climb) this._gatherScroll(dt);

    // The booms run when the visitor turns them on, and the rotor wash still kicks up when
    // the aircraft is moved hard, which is the behaviour that was here before the button.
    const moving = Math.hypot(this.vel.x, this.vel.y);
    const wash = this.armed && moving > 1.2;
    if (!this.reduced && (this.spraying || wash)) {
      const model = this._modelMatrix();
      // Spraying throws twice as much per frame as wash does, out of the same two nozzles.
      // A fan you can see through is a fan that has not been turned on.
      const bursts = this.spraying ? 2 : 1;
      for (let b = 0; b < bursts; b++) {
        for (let n = 0; n < NOZZLES.length; n++) {
          const [nx2, ny2, nz2] = NOZZLES[n];
          const p = m4.transformPoint(model, nx2, ny2, nz2);
          const hub = m4.transformPoint(model, 0, ny2, nz2);
          this.spray.emit(
            p,
            [p[0] - hub[0], p[1] - hub[1], p[2] - hub[2]],
            this.frame * 4 + b * 2 + n,
            this.spraying
          );
        }
      }
    }
    this.spray.step(dt, (i) => this._land(i));
    this.splats.step(dt);

    // What the rotors are doing, as one number, for anything that wants to know. The tone
    // has to answer the visitor, so it is the WORK the aircraft is doing and not its
    // airspeed: holding station under autopilot is the floor, being flown is most of the
    // rest, and opening the booms puts a real load on the airframe on top of that.
    this.sound?.rotors(
      (this.armed ? 0.26 : 0.1) +
      Math.min(0.5, moving * 0.24) +
      (this.spraying ? 0.16 : 0)
    );
  }

  // A droplet ran out of air. Where it was, in the frame, is where the paint lands.
  //
  // The camera is a bare translation down the Z axis, so clip space needs no matrices here:
  // the half-extents of the frustum at the droplet's own depth are already computed for the
  // autopilot, and dividing by them IS the perspective divide. Which also means this holds
  // while the aircraft is being drawn and while it is not, and never depends on a frame
  // having been drawn first.
  _land(i) {
    this.landed = (this.landed + 1) % LAND_EVERY;
    if (this.landed) return;
    const z = this.spray.pos[i * 3 + 2];
    const hh = this.halfHeightAt(z);
    if (hh <= 0) return;
    const x = this.spray.pos[i * 3] / (hh * (this.aspect || 1.6));
    const y = this.spray.pos[i * 3 + 1] / hh;
    // Off the glass entirely: no mark, and no slot spent on one nobody can see.
    if (Math.abs(x) > 1.15 || Math.abs(y) > 1.15) return;
    // Size is the perspective again: a droplet that landed near the camera made a bigger
    // mark than one that landed far from it, for the same reason it drew as a bigger point.
    const spread = 0.055 + 0.06 * ((i % 7) / 6);
    const px = Math.min(64, Math.max(6, (spread / hh) * (this.canvas.height / 2)));
    const ttl = SPLAT_LIFE[0] + (SPLAT_LIFE[1] - SPLAT_LIFE[0]) * ((i % 11) / 10);
    // And the last step is out of the frame and onto the page. Clip Y is +1 at the top of
    // the viewport, so this is the mark's distance down the viewport plus how far down the
    // document the viewport itself is. That sum is what does not move when the page does.
    const docY = this.scrollY + ((1 - y) / 2) * window.innerHeight;
    this.splats.add(
      x, docY,
      this.spray.col[i * 3], this.spray.col[i * 3 + 1], this.spray.col[i * 3 + 2],
      px, ttl
    );
  }

  // Flying the aircraft off the top or the bottom of the frame takes the page with it. Fly
  // up and the page comes up; fly down and it goes down; and the further past the middle the
  // aircraft is, the faster it goes.
  //
  // This is not a flourish. Arming the drone spends the arrow keys and W and S on flying it,
  // which is the keyboard scrolling the visitor had a moment earlier. Handing that back
  // through the aircraft is the only version of it that costs nothing to learn.
  //
  // Two things keep it civil. There is a dead band in the middle of the frame where flying
  // is only flying, so a small correction does not move the page under the copy someone is
  // reading. And the rate is tied to the KEY BEING HELD as well as to the position: an
  // aircraft parked near the top edge with nothing pressed sits still, rather than scrolling
  // the page away on its own until it runs out of document.
  _gatherScroll(dt) {
    const hh = this.halfHeightAt(this.pos.z);
    const dead = hh * SCROLL_DEAD;
    const limit = hh * FLY_LIMIT_Y;
    const past = this.climb > 0 ? this.pos.y - dead : -this.pos.y - dead;
    if (past <= 0) return;

    // Eased, so the page creeps in as the aircraft leaves the band rather than snapping to
    // a rate the moment it crosses the edge.
    const ramp = Math.min(1, past / Math.max(limit - dead, 1e-4)) ** 1.5;
    this.scrollAcc -= this.climb * SCROLL_MAX * ramp * dt;
  }

  // Whole pixels only, with the remainder carried: at the bottom of the ramp a frame is
  // worth a fraction of a pixel, and rounding that away would stall the creep entirely.
  _applyScroll() {
    const whole = Math.trunc(this.scrollAcc);
    if (!whole) return;
    this.scrollAcc -= whole;
    // Instant, explicitly. The page sets scroll-behavior: smooth, and a smooth scrollBy on
    // every frame queues sixty animations a second that spend their time fighting.
    window.scrollBy({ top: whole, behavior: 'instant' });
  }

  // Built from this.pos every time it is asked for rather than cached on the instance:
  // tools/gate-drone.mjs parks the aircraft by writing pos directly and then calls draw()
  // with no step() in between, and a cached matrix would render it at where it used to be.
  _modelMatrix() {
    // Bank into the direction of travel, and bob gently when idle.
    const roll = Math.max(-0.5, Math.min(0.5, -this.vel.x * 0.055));
    const pitch = Math.max(-0.45, Math.min(0.45, this.vel.y * 0.055));
    const bob = this.reduced ? 0 : Math.sin(this.t * 1.9) * 0.05;

    let model = m4.translation(this.pos.x, this.pos.y + bob, this.pos.z);
    model = m4.multiply(model, m4.rotationX(BASE_PITCH));   // world frame: see BASE_PITCH
    model = m4.multiply(model, m4.rotationY(this.t * 0.22));
    model = m4.multiply(model, m4.rotationZ(roll));
    model = m4.multiply(model, m4.rotationX(pitch));
    return model;
  }

  // Colour and brightness of the status lights, straight off the sequence.
  _ledColor() {
    if (this.reduced) return [LED_GREEN, 1];
    switch (this.link) {
      case 'selftest':
        return [[SIGNAL, LED_GREEN, LED_YELLOW][Math.floor(this.t * 6.5) % 3], 1];
      case 'warmup':
        return [LED_YELLOW, (this.linkT * 4) % 1 < 0.5 ? 1 : 0.08];
      case 'linked':
        return [LED_GREEN, 1];
      default:
        return [LED_GREEN, (this.t * 0.8) % 1 < 0.22 ? 1 : 0.2];
    }
  }

  draw() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = m4.perspective(FOV, this.aspect || 1.6, 0.1, 60);
    const view = m4.translation(0, 0, -CAMERA_Z);
    const model = this._modelMatrix();

    this._bakeBudget = 1;
    this._drawOccluders(proj, view);
    this._drawTextMasks(proj, view);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniform1f(this.loc.uAlpha, 1);

    const bind = (buffer, loc, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };

    bind(this.bPos, this.loc.aPos, 3);
    bind(this.bNrm, this.loc.aNormal, 3);
    bind(this.bCol, this.loc.aColor, 3);
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    gl.uniformMatrix3fv(this.loc.uNormalMat, false, m4.normalFromRotation(model));
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    // Eight rotors, each on its own mast, each coaxial pair turning against the other.
    bind(this.rPos, this.loc.aPos, 3);
    bind(this.rNrm, this.loc.aNormal, 3);
    bind(this.rCol, this.loc.aColor, 3);
    for (const [mx, my, mz, dir] of ROTOR_MOUNTS) {
      let m = m4.multiply(model, m4.translation(mx, my, mz));
      m = m4.multiply(m, m4.rotationY(this.spin * dir));
      gl.uniformMatrix4fv(this.loc.uModel, false, m);
      gl.uniformMatrix3fv(this.loc.uNormalMat, false, m4.normalFromRotation(m));
      gl.drawArrays(gl.TRIANGLES, 0, this.rotorCount);
    }

    this._drawSpray(proj, view);
    this._drawLights(proj, view, model);
    // Last, and in front of everything: the paint is on the page, not in the scene.
    this._drawSplats();
  }

  // Depth only, no colour. Where one of these ends up in front of the aircraft the depth
  // test throws the aircraft's fragments away, the transparent canvas lets the real element
  // through, and the aircraft is behind it, edges and all.
  _drawOccluders(proj, view) {
    const gl = this.gl;
    const quads = this._occluderQuads();
    if (!quads.length) return;

    gl.useProgram(this.oProg);
    gl.uniformMatrix4fv(this.oLoc.uProj, false, proj);
    gl.uniformMatrix4fv(this.oLoc.uView, false, view);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bOPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quads), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.oLoc.aPos);
    gl.vertexAttribPointer(this.oLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.colorMask(false, false, false, false);
    gl.drawArrays(gl.TRIANGLES, 0, quads.length / 3);
    gl.colorMask(true, true, true, true);
  }

  // The copy, glyph by glyph, on the plane the aircraft drifts through. Depth only, and
  // the mask decides which fragments get to write it: where a letter is, the aircraft is
  // behind it whenever it is deeper than TEXT_Z, and where a letter is not, the aircraft is
  // simply there. That is what makes it read as flying THROUGH a headline rather than over
  // a rectangle that happens to contain one.
  _drawTextMasks(proj, view) {
    const gl = this.gl;
    if (!this.crossers?.size) return;

    let bound = false;
    const vw = window.innerWidth, vh = window.innerHeight;
    const per = (2 * this.halfHeightAt(TEXT_Z)) / vh;

    for (const el of this.crossers.keys()) {
      const mask = this._maskFor(el);
      if (!mask) continue;
      const v = this._visibleRect(el);
      if (!v) continue;

      // The mask covers the element's whole rect, so a rect clipped by its act or by the
      // viewport has to take the matching corner of the mask with it.
      const u0 = (v.l - v.rect.left) / v.rect.width;
      const u1 = (v.r - v.rect.left) / v.rect.width;
      const t0 = (v.rect.bottom - v.b) / v.rect.height;
      const t1 = (v.rect.bottom - v.t) / v.rect.height;
      const x0 = (v.l - vw / 2) * per, x1 = (v.r - vw / 2) * per;
      const y0 = (vh / 2 - v.b) * per, y1 = (vh / 2 - v.t) * per;

      if (!bound) {
        gl.useProgram(this.mProg);
        gl.uniformMatrix4fv(this.mLoc.uProj, false, proj);
        gl.uniformMatrix4fv(this.mLoc.uView, false, view);
        gl.uniform1i(this.mLoc.uMask, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.enableVertexAttribArray(this.mLoc.aPos);
        gl.enableVertexAttribArray(this.mLoc.aUV);
        gl.colorMask(false, false, false, false);
        bound = true;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.bMPos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x0, y0, TEXT_Z, x1, y0, TEXT_Z, x1, y1, TEXT_Z,
        x0, y0, TEXT_Z, x1, y1, TEXT_Z, x0, y1, TEXT_Z,
      ]), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.mLoc.aPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.bMUV);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        u0, t0, u1, t0, u1, t1,
        u0, t0, u1, t1, u0, t1,
      ]), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(this.mLoc.aUV, 2, gl.FLOAT, false, 0, 0);

      gl.bindTexture(gl.TEXTURE_2D, mask.tex);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    if (bound) {
      gl.colorMask(true, true, true, true);
      gl.disableVertexAttribArray(this.mLoc.aUV);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  _drawSpray(proj, view) {
    const gl = this.gl;
    const live = [];
    const lives = [];
    const tints = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.spray.life[i] <= 0) continue;
      live.push(this.spray.pos[i * 3], this.spray.pos[i * 3 + 1], this.spray.pos[i * 3 + 2]);
      lives.push(this.spray.life[i]);
      tints.push(this.spray.col[i * 3], this.spray.col[i * 3 + 1], this.spray.col[i * 3 + 2]);
    }
    if (!lives.length) return;

    gl.useProgram(this.pProg);
    gl.uniformMatrix4fv(this.pLoc.uProj, false, proj);
    gl.uniformMatrix4fv(this.pLoc.uView, false, view);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(live), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.pLoc.aPos);
    gl.vertexAttribPointer(this.pLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPLife);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lives), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.pLoc.aLife);
    gl.vertexAttribPointer(this.pLoc.aLife, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPCol);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tints), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.pLoc.aTint);
    gl.vertexAttribPointer(this.pLoc.aTint, 3, gl.FLOAT, false, 0, 0);

    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, lives.length);
    gl.depthMask(true);
    gl.disableVertexAttribArray(this.pLoc.aTint);
  }

  // The paint. No matrices, no depth test: the only transform any of this needs is the page
  // scroll, which is one subtraction, and they are in front of the whole scene by
  // construction, so the only state this touches is the depth test, and it puts it back.
  _drawSplats() {
    const gl = this.gl;
    const ndc = [];
    const tint = [];
    const lives = [];
    const sizes = [];
    const vh = window.innerHeight;
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (this.splats.life[i] <= 0) continue;
      // Back from the document into the frame, with wherever the page is this frame.
      const y = 1 - 2 * (this.splats.docY[i] - this.scrollY) / vh;
      // Scrolled off the glass. Still drying, and still on the page: it is only not here.
      // Its slot is deliberately left alone, so scrolling back finds it exactly where it
      // was, which is the whole point of anchoring these to the document.
      if (Math.abs(y) > 1.15) continue;
      ndc.push(this.splats.x[i], y);
      tint.push(this.splats.col[i * 3], this.splats.col[i * 3 + 1], this.splats.col[i * 3 + 2]);
      lives.push(this.splats.life[i]);
      sizes.push(this.splats.size[i]);
    }
    if (!lives.length) return;

    gl.useProgram(this.sProg);
    const feed = (buffer, loc, size, data) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    feed(this.bSNDC, this.sLoc.aNDC, 2, ndc);
    feed(this.bSCol, this.sLoc.aTint, 3, tint);
    feed(this.bSLife, this.sLoc.aLife, 1, lives);
    feed(this.bSSize, this.sLoc.aSize, 1, sizes);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, lives.length);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    for (const loc of [this.sLoc.aNDC, this.sLoc.aTint, this.sLoc.aLife, this.sLoc.aSize]) {
      gl.disableVertexAttribArray(loc);
    }
  }

  // Additive, so an LED reads as a light rather than as a coloured dot painted on the hull.
  _drawLights(proj, view, model) {
    const gl = this.gl;
    const [color, intensity] = this._ledColor();
    if (intensity <= 0) return;

    const pts = [];
    for (const p of LED_POINTS) {
      const w = m4.transformPoint(model, p[0], p[1], p[2]);
      pts.push(w[0], w[1], w[2]);
    }

    gl.useProgram(this.lProg);
    gl.uniformMatrix4fv(this.lLoc.uProj, false, proj);
    gl.uniformMatrix4fv(this.lLoc.uView, false, view);
    gl.uniform3f(this.lLoc.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.lLoc.uIntensity, intensity);
    gl.uniform1f(this.lLoc.uSize, 7 * Math.min(this.dpr || 1, 2));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bLPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.lLoc.aPos);
    gl.vertexAttribPointer(this.lLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, LED_POINTS.length);
    gl.depthMask(true);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}
