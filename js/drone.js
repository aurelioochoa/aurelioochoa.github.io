// The drone.
//
// One low-poly quadcopter in a fixed, transparent, full-viewport canvas that sits above
// every act and belongs to none of them. For the first half of the page it flies its own
// path. From the handover act onward the controls are the visitor's, and they stay the
// visitor's for the rest of the page.
//
// Written against raw WebGL on purpose: the whole scene is a few hundred triangles, so a
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
const FRAG = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vColor;
uniform float uAlpha;
void main() {
  vec3 n = normalize(vNormal);
  float key = max(dot(n, normalize(vec3(0.45, 0.9, 0.35))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, 0.15, -0.5))), 0.0);
  float lit = 0.30 + 0.78 * key + 0.20 * fill;
  lit = floor(lit * 5.0) / 5.0;
  gl_FragColor = vec4(vColor * lit, uAlpha);
}`;

const PARTICLE_VERT = `
attribute vec3 aPos;
attribute float aLife;
uniform mat4 uProj;
uniform mat4 uView;
varying float vLife;
void main() {
  vLife = aLife;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
  gl_PointSize = max(1.0, 7.0 * aLife);
}`;

const PARTICLE_FRAG = `
precision mediump float;
varying float vLife;
uniform vec3 uColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(uColor, vLife * 0.85);
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
  // Normal matrix for a rotation-and-uniform-scale model matrix: the rotation block is
  // orthonormal once the uniform scale is divided out, so the inverse-transpose reduces to
  // the rotation block itself.
  normalFromRotation(m) {
    return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
  },
};

/* ---------- geometry ---------- */

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

// Flat n-gon disc in the XZ plane. Eight segments, because the silhouette should read as
// faceted rather than round.
function pushDisc(g, cx, cy, cz, radius, segments, color) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * radius, cy, cz + Math.sin(a0) * radius];
    const p1 = [cx + Math.cos(a1) * radius, cy, cz + Math.sin(a1) * radius];
    for (const p of [[cx, cy, cz], p0, p1]) {
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(0, 1, 0);
      g.col.push(color[0], color[1], color[2]);
    }
  }
}

// How far back the camera sits. Larger reads as a smaller, more distant aircraft, which is
// what keeps it crossing the page rather than blocking the copy underneath it.
const CAMERA_Z = 11.5;
const FOV = 0.62;

const SHELL = [0.93, 0.93, 0.95];
const SHELL_DARK = [0.42, 0.45, 0.55];
const SIGNAL = [0.894, 0.196, 0.169]; // the page accent, the one colour that never varies
const ROTOR = [0.20, 0.22, 0.30];
const TANK = [0.16, 0.18, 0.26];

function buildDrone() {
  const g = { pos: [], nrm: [], col: [] };
  const arm = 0.62;

  pushBox(g, 0, 0, 0, 0.62, 0.20, 0.62, SHELL);           // body
  pushBox(g, 0, 0.13, 0, 0.36, 0.10, 0.36, SHELL_DARK);   // canopy
  pushBox(g, 0, -0.14, 0.02, 0.30, 0.16, 0.44, TANK);     // spray tank

  const legs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of legs) {
    const ax = (sx * arm) / 2, az = (sz * arm) / 2;
    pushBox(g, ax, 0.01, az, Math.abs(arm) * 1.02, 0.07, 0.11, SHELL);  // arm
    pushBox(g, sx * arm, 0.06, sz * arm, 0.15, 0.15, 0.15, SHELL_DARK); // motor
    pushDisc(g, sx * arm, 0.15, sz * arm, 0.34, 8, ROTOR);              // rotor disc
    pushBox(g, sx * arm * 0.72, -0.20, sz * arm * 0.72, 0.06, 0.26, 0.06, SHELL_DARK);
  }
  // Skids, and the one red element on the aircraft.
  pushBox(g, 0, -0.34, 0.42, 1.20, 0.06, 0.07, SIGNAL);
  pushBox(g, 0, -0.34, -0.42, 1.20, 0.06, 0.07, SIGNAL);

  return g;
}

/* ---------- particles ---------- */

const MAX_PARTICLES = 220;

class Spray {
  constructor() {
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.head = 0;
  }
  emit(x, y, z, seed) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    // Deterministic-ish jitter from a seed keeps this free of Math.random churn.
    const a = seed * 2.399963;
    this.pos[i * 3] = x + Math.cos(a) * 0.18;
    this.pos[i * 3 + 1] = y - 0.3;
    this.pos[i * 3 + 2] = z + Math.sin(a) * 0.18;
    this.vel[i * 3] = Math.cos(a) * 0.4;
    this.vel[i * 3 + 1] = -1.7;
    this.vel[i * 3 + 2] = Math.sin(a) * 0.4;
    this.life[i] = 1;
  }
  step(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 1.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= dt * 1.2;
    }
  }
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
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pos = { x: 0, y: 0.4, z: 0 };
    this.target = { x: 0, y: 0.4 };
    this.vel = { x: 0, y: 0 };
    this.spin = 0;
    this.t = 0;
    this.frame = 0;
    this.keys = new Set();
    this.dragging = false;
    this.spray = new Spray();
    this.running = false;
    this.onFirstInput = null;
    this.hasFlown = false;

    this._initGL();
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

    const g = buildDrone();
    this.vertexCount = g.pos.length / 3;
    const buf = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return b;
    };
    this.bPos = buf(g.pos);
    this.bNrm = buf(g.nrm);
    this.bCol = buf(g.col);

    this.bPPos = gl.createBuffer();
    this.bPLife = gl.createBuffer();

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
      uProj: gl.getUniformLocation(this.pProg, 'uProj'),
      uView: gl.getUniformLocation(this.pProg, 'uView'),
      uColor: gl.getUniformLocation(this.pProg, 'uColor'),
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
  }

  _bindInput() {
    const el = this.canvas;

    const pointTo = (clientX, clientY) => {
      // Map the pointer into the same world units the camera frames, so the drone lands
      // under the cursor rather than merely drifting toward it.
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = -((clientY / window.innerHeight) * 2 - 1);
      this.target.x = nx * this.halfWidth();
      this.target.y = ny * this.halfHeight();
      this._noteInput();
    };

    el.addEventListener('pointerdown', (e) => {
      if (!this.armed) return;
      this.dragging = true;
      el.setPointerCapture(e.pointerId);
      pointTo(e.clientX, e.clientY);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.armed || !this.dragging) return;
      pointTo(e.clientX, e.clientY);
      e.preventDefault();
    });
    const release = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (e.pointerId != null && el.hasPointerCapture?.(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);

    this._onKeyDown = (e) => {
      if (!this.armed) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        this._noteInput();
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', () => this.resize());
  }

  _noteInput() {
    if (this.hasFlown) return;
    this.hasFlown = true;
    this.onFirstInput?.();
  }

  // Half-extents of the camera frustum at the drone's depth, in world units.
  halfHeight() { return Math.tan(FOV / 2) * CAMERA_Z; }
  halfWidth() { return this.halfHeight() * (this.aspect || 1.6); }

  arm() {
    if (this.armed) return;
    this.armed = true;
    this.canvas.style.pointerEvents = 'auto';
    this.canvas.setAttribute('tabindex', '0');
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
      const hw = this.halfWidth() * 0.88;
      const hh = this.halfHeight() * 0.82;
      this.target.x = Math.max(-hw, Math.min(hw, this.target.x));
      this.target.y = Math.max(-hh, Math.min(hh, this.target.y));
    } else if (!this.reduced) {
      // Autopilot. A slow lissajous so the aircraft crosses the page rather than orbiting,
      // held in the upper band: headlines sit on the vertical centre line, and an aircraft
      // parked on top of a headline costs more than the overlap is worth. Once the visitor
      // takes the controls this restriction is gone and the whole frame is theirs.
      this.target.x = Math.sin(this.t * 0.31) * this.halfWidth() * 0.66;
      this.target.y = this.halfHeight() * (0.74 + 0.14 * Math.sin(this.t * 0.47 + 1.1));
    }

    // Critically-damped-ish follow. The residual velocity is what drives the body tilt.
    const k = this.armed ? 3.4 : 1.5;
    const nx = this.pos.x + (this.target.x - this.pos.x) * Math.min(1, k * dt);
    const ny = this.pos.y + (this.target.y - this.pos.y) * Math.min(1, k * dt);
    this.vel.x = (nx - this.pos.x) / Math.max(dt, 1e-4);
    this.vel.y = (ny - this.pos.y) / Math.max(dt, 1e-4);
    this.pos.x = nx;
    this.pos.y = ny;

    const moving = Math.hypot(this.vel.x, this.vel.y);
    if (this.armed && moving > 1.2 && !this.reduced) {
      this.spray.emit(this.pos.x, this.pos.y, 0, this.frame);
    }
    this.spray.step(dt);
  }

  draw() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = m4.perspective(FOV, this.aspect || 1.6, 0.1, 60);
    const view = m4.translation(0, 0, -CAMERA_Z);

    // Bank into the direction of travel, and bob gently when idle.
    const roll = Math.max(-0.5, Math.min(0.5, -this.vel.x * 0.055));
    const pitch = Math.max(-0.45, Math.min(0.45, this.vel.y * 0.055));
    const bob = this.reduced ? 0 : Math.sin(this.t * 1.9) * 0.05;

    let model = m4.translation(this.pos.x, this.pos.y + bob, 0);
    model = m4.multiply(model, m4.rotationY(this.t * 0.22));
    model = m4.multiply(model, m4.rotationZ(roll));
    model = m4.multiply(model, m4.rotationX(pitch));

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    gl.uniformMatrix3fv(this.loc.uNormalMat, false, m4.normalFromRotation(model));
    gl.uniform1f(this.loc.uAlpha, 1);

    const bind = (buffer, loc, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    bind(this.bPos, this.loc.aPos, 3);
    bind(this.bNrm, this.loc.aNormal, 3);
    bind(this.bCol, this.loc.aColor, 3);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    this._drawSpray(proj, view);
  }

  _drawSpray(proj, view) {
    const gl = this.gl;
    const live = [];
    const lives = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.spray.life[i] <= 0) continue;
      live.push(this.spray.pos[i * 3], this.spray.pos[i * 3 + 1], this.spray.pos[i * 3 + 2]);
      lives.push(this.spray.life[i]);
    }
    if (!lives.length) return;

    gl.useProgram(this.pProg);
    gl.uniformMatrix4fv(this.pLoc.uProj, false, proj);
    gl.uniformMatrix4fv(this.pLoc.uView, false, view);
    gl.uniform3f(this.pLoc.uColor, SIGNAL[0], SIGNAL[1], SIGNAL[2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(live), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.pLoc.aPos);
    gl.vertexAttribPointer(this.pLoc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPLife);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lives), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.pLoc.aLife);
    gl.vertexAttribPointer(this.pLoc.aLife, 1, gl.FLOAT, false, 0, 0);

    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, lives.length);
    gl.depthMask(true);
  }
}
