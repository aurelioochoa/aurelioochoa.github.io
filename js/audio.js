// The sound.
//
// Everything this page makes a noise with is SYNTHESISED, in the Web Audio graph, from
// oscillators and one buffer of white noise. Nothing is fetched, so the no-network gate
// stays true and the repo gains no binary. That is a happy side effect rather than the
// reason.
//
// The reason is that the rotors have to answer the visitor. A recorded loop of a real
// aircraft plays back at one speed and one load forever, so it says the same thing while
// the drone is parked as it does while someone is hauling it across the page with the
// keys, and a rotor note that ignores the throttle reads as a backing track laid over the
// aircraft rather than as the aircraft. Blade-pass frequency, its harmonics and the
// broadband wash all move with RPM, and here they can, because they are generated.
//
// What is being modelled, and the numbers are the real ones: a multirotor's dominant tone
// is its blade-pass frequency, the rate at which blades go past a point, and small drones
// sit at 100 to 300 Hz. An agricultural airframe swings much bigger props much slower, so
// this one runs lower, from 78 Hz idling to about 132 Hz worked hard. On top of that sit
// strong harmonics reaching several kHz, and a broadband wash from the blades cutting
// turbulent air, which lives in the low kHz. Four voices carry the tone rather than one,
// detuned a few cents apart, because eight rotors are never in phase and the beating
// between them is the "wub" that makes a multirotor sound like a multirotor and not like
// a hairdryer.
//
// The preference is remembered and it starts OFF. A page that makes noise before it is
// asked to is a page people close, and a browser will not let it anyway: an AudioContext
// created outside a gesture starts suspended. So the context is built on the click that
// turns the sound on, and never before it.

const STORE_KEY = 'sound';

const AudioCtx = typeof window !== 'undefined'
  ? (window.AudioContext || window.webkitAudioContext)
  : null;

// Blade pass, as a waveform. The harmonic ladder is what carries it: a bare sine at 90 Hz
// is a hum from a fridge, and the same fundamental with this series over it is a rotor.
const BLADE_HARMONICS = [0, 1, 0.74, 0.52, 0.34, 0.25, 0.18, 0.13, 0.1, 0.08, 0.06, 0.05];

// Four voices, detuned in cents, and each with its own share of the bus. Nothing here is
// random: the same aircraft has to sound like the same aircraft on every visit.
const VOICES = [
  { detune: -17, gain: 0.30, ratio: 1 },
  { detune: -6, gain: 0.26, ratio: 1 },
  { detune: 7, gain: 0.24, ratio: 1 },
  { detune: 19, gain: 0.20, ratio: 2 },   // one octave up, quietly: the motor whine
];

export function soundAvailable() {
  return !!AudioCtx;
}

export function storedPreference() {
  try {
    return localStorage.getItem(STORE_KEY) === 'on';
  } catch {
    return false;   // blocked storage is not a reason to start making noise
  }
}

export class Sound {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.muted = false;      // the tab went away; the preference is untouched
    this.throttle = 0;
    this._lastThrottle = -1;
    this._spraying = false;
    this._hold = null;
    this.onChange = null;
  }

  /* ---------- the graph ---------- */

  // Built once, on the gesture that first turns the sound on. Everything below runs for the
  // life of the page after that: oscillators are cheap and starting them costs a click, so
  // they idle at zero gain rather than being created and destroyed per state change.
  _build() {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // A limiter on the way out. Four detuned voices plus noise plus a cue landing on the
    // same sample is exactly the pile-up that clips, and clipping on someone's laptop
    // speakers is the one failure that makes a person turn this off and never turn it on.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    this.master.connect(limiter);

    // Two seconds of white noise, looped. Two rather than one so the loop point is not a
    // pulse anyone can count.
    const frames = Math.floor(ctx.sampleRate * 2);
    const noise = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 0x2f6e2b1;
    for (let i = 0; i < frames; i++) {
      // A small xorshift, so the noise is identical on every machine and every visit.
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = seed / 0x80000000;
    }
    this.noise = noise;

    /* the rotors */

    this.rotorBus = ctx.createGain();
    this.rotorBus.gain.setValueAtTime(0, now);
    this.rotorBus.connect(this.master);

    // The lowpass is the throttle's tone control. Idling, the aircraft is a low throb with
    // the harmonics rolled off; worked hard, the ladder opens up and it gets its edge.
    this.rotorTone = ctx.createBiquadFilter();
    this.rotorTone.type = 'lowpass';
    this.rotorTone.frequency.setValueAtTime(1000, now);
    this.rotorTone.Q.value = 0.7;
    this.rotorTone.connect(this.rotorBus);

    const wave = ctx.createPeriodicWave(
      new Float32Array(BLADE_HARMONICS.length),
      Float32Array.from(BLADE_HARMONICS),
      { disableNormalization: false }
    );

    this.voices = VOICES.map((v) => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      osc.frequency.setValueAtTime(78 * v.ratio, now);
      osc.detune.setValueAtTime(v.detune, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(v.gain, now);
      osc.connect(gain).connect(this.rotorTone);
      osc.start();
      return { osc, ratio: v.ratio };
    });

    // The wash: blades cutting turbulent air, which is broadband and lives in the low kHz.
    this.wash = ctx.createGain();
    this.wash.gain.setValueAtTime(0, now);
    this.wash.connect(this.rotorBus);
    const washBand = ctx.createBiquadFilter();
    washBand.type = 'bandpass';
    washBand.frequency.setValueAtTime(1500, now);
    washBand.Q.value = 0.8;
    washBand.connect(this.wash);
    this._loop(this.noise, washBand);

    // And the slow breathing of an airframe holding station, which is a real thing you hear
    // standing under one: the controller is trimming eight motors against each other.
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.42, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(4, now);          // cents
    lfo.connect(lfoGain);
    for (const v of this.voices) lfoGain.connect(v.osc.detune);
    lfo.start();

    /* the spray */

    this.sprayBus = ctx.createGain();
    this.sprayBus.gain.setValueAtTime(0, now);
    this.sprayBus.connect(this.master);
    // A centrifugal nozzle atomising liquid is hiss, and hiss is noise with the bottom
    // taken off it. The sweep below is what stops it being a television tuned to nothing.
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'highpass';
    hiss.frequency.setValueAtTime(1700, now);
    hiss.Q.value = 0.6;
    hiss.connect(this.sprayBus);
    this._loop(this.noise, hiss);
    const sweep = ctx.createOscillator();
    sweep.frequency.setValueAtTime(2.7, now);
    const sweepGain = ctx.createGain();
    sweepGain.gain.setValueAtTime(420, now);
    sweep.connect(sweepGain).connect(hiss.frequency);
    sweep.start();

    /* the cues */

    this.cueBus = ctx.createGain();
    this.cueBus.gain.setValueAtTime(0.9, now);
    this.cueBus.connect(this.master);
  }

  _loop(buffer, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(dest);
    src.start();
    return src;
  }

  /* ---------- the switch ---------- */

  // Call this from a real gesture. Creating the context anywhere else gets one that is
  // suspended and stays suspended, which looks exactly like a broken toggle.
  setEnabled(on) {
    const next = !!on && !!AudioCtx;
    if (next === this.enabled) return this.enabled;
    // The confirmation for switching off has to be played while the graph is still live,
    // which is why it happens before the flag moves rather than in the branch below.
    if (!next && this.ctx) this.cue('off');
    this.enabled = next;
    try {
      localStorage.setItem(STORE_KEY, next ? 'on' : 'off');
    } catch {
      // A switch that does not persist is still a switch.
    }

    if (next) {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this._build();
      }
      this.ctx.resume?.();
      // The aircraft may have been flying, and spraying, the whole time the sound was off.
      // Coming up has to land on what is happening now rather than on what was happening
      // when it was last switched on.
      this._lastThrottle = -1;
      this._apply();
      this.sprayBus.gain.setTargetAtTime(this._spraying ? 0.075 : 0, this.ctx.currentTime, 0.11);
      this.cue('on');
    } else if (this.ctx) {
      // Fade before suspending, or the whole graph stops mid cycle and the visitor's reward
      // for turning the sound off is a click.
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => { if (!this.enabled) this.ctx?.suspend?.(); }, 380);
    }
    this.onChange?.(this.enabled);
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  // The tab went away. The preference is not touched, so coming back restores what the
  // visitor asked for rather than what the browser did to them.
  mute(on) {
    this.muted = !!on;
    if (!this.ctx || !this.enabled) return;
    if (this.muted) this.ctx.suspend?.();
    else { this.ctx.resume?.(); this._apply(); }
  }

  get live() { return this.enabled && !this.muted && !!this.ctx; }

  _apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, t, 0.08);
  }

  /* ---------- the aircraft ---------- */

  // Called every frame, so it does the least it can get away with: the graph is only
  // written when the throttle has actually moved, and the ramps are long enough that a
  // frame drop is inaudible rather than a step.
  rotors(level) {
    this.throttle = Math.max(0, Math.min(1, level));
    if (!this.live) return;
    if (Math.abs(this.throttle - this._lastThrottle) < 0.012) return;
    this._lastThrottle = this.throttle;
    const t = this.ctx.currentTime;
    const l = this.throttle;

    const f0 = 78 + 54 * l;
    for (const v of this.voices) v.osc.frequency.setTargetAtTime(f0 * v.ratio, t, 0.14);
    this.rotorTone.frequency.setTargetAtTime(900 + 2500 * l, t, 0.16);
    this.wash.gain.setTargetAtTime(0.05 + 0.13 * l, t, 0.18);
    this.rotorBus.gain.setTargetAtTime(0.20 + 0.30 * l, t, 0.16);
  }

  spray(on) {
    this._spraying = !!on;
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this.sprayBus.gain.cancelScheduledValues(t);
    if (on) {
      // The pump takes the pressure up, then the nozzles open. Two events, in that order,
      // because that is the order they happen in on the aircraft.
      this.sprayBus.gain.setTargetAtTime(0.075, t + 0.09, 0.11);
      this._thunk(t, 132, 58, 0.26);
    } else {
      this.sprayBus.gain.setTargetAtTime(0, t, 0.09);
      this._thunk(t, 78, 44, 0.13);
    }
  }

  // The pump, and the valve closing. A sine dropping fast is a mechanical thump; the same
  // shape rising is not, which is why the two calls above pass their frequencies the way
  // round they do.
  _thunk(t, from, to, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.cueBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /* ---------- the controller ---------- */

  // One short tone. Everything the controller says is built out of these.
  _blip(freq, { dur = 0.09, type = 'square', gain = 0.14, to = null, at = 0 } = {}) {
    if (!this.live) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.cueBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // The two seconds of the hold, as one rising tone. It is not decoration: the controller
  // asks for a press held for two seconds, and a visitor holding a button with no idea
  // whether it is counting is the failure this whole act was written to avoid. The tone
  // climbing is the track filling, for anyone not looking at the track.
  holdStart(ms) {
    if (!this.live) return;
    this.holdEnd(false);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(196, t);
    osc.frequency.exponentialRampToValueAtTime(523, t + ms / 1000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.05);
    osc.connect(g).connect(this.cueBus);
    osc.start(t);
    this._hold = { osc, g };
  }

  // Released early, the tone falls away; completed, it is cut clean and the link chord
  // takes over. A hold that failed and a hold that succeeded must never sound alike.
  holdEnd(completed) {
    const held = this._hold;
    this._hold = null;
    if (!held || !this.ctx) return;
    const t = this.ctx.currentTime;
    held.g.gain.cancelScheduledValues(t);
    held.g.gain.setValueAtTime(held.g.gain.value, t);
    if (completed) {
      held.g.gain.exponentialRampToValueAtTime(0.0008, t + 0.06);
      held.osc.stop(t + 0.1);
    } else {
      held.osc.frequency.cancelScheduledValues(t);
      held.osc.frequency.setValueAtTime(held.osc.frequency.value, t);
      held.osc.frequency.exponentialRampToValueAtTime(120, t + 0.22);
      held.g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      held.osc.stop(t + 0.28);
    }
  }

  // Named cues, so no caller anywhere else has to know a frequency.
  cue(name) {
    switch (name) {
      case 'press':    this._blip(720, { dur: 0.06, gain: 0.13 }); break;
      case 'selftest': this._blip(440, { dur: 0.08, type: 'triangle', gain: 0.1 }); break;
      case 'warmup':   this._blip(587, { dur: 0.08, type: 'triangle', gain: 0.1 }); break;
      case 'linked':
        this._blip(523, { dur: 0.1, type: 'triangle', gain: 0.12 });
        this._blip(659, { dur: 0.1, type: 'triangle', gain: 0.12, at: 0.1 });
        this._blip(784, { dur: 0.22, type: 'triangle', gain: 0.13, at: 0.2 });
        break;
      case 'on':       this._blip(660, { dur: 0.07, type: 'triangle', gain: 0.12, to: 990 }); break;
      case 'off':      this._blip(660, { dur: 0.07, type: 'triangle', gain: 0.12, to: 330 }); break;
      case 'click':    this._blip(880, { dur: 0.04, gain: 0.09 }); break;
      case 'denied':   this._blip(190, { dur: 0.1, gain: 0.09 }); break;
      default: break;
    }
  }
}
