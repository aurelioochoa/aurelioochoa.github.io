// The controller.
//
// The peak act used to hand over the drone with a red button that said "Take the controls".
// It works, and it says nothing. Aurelio flies a DJI RC every week, and a DJI RC does not
// turn on when you press its power button: you press it once, then you press and hold it,
// and about two seconds later the screen comes up. Anyone who has held one knows that
// rhythm, and anyone who has not learns something true about the job in the two seconds
// they spend holding a button down.
//
// So the handover is the controller, the affordance is its real power button, and the
// ritual is the real ritual.
//
//   off     the ring pulses, the screen is dark      "Controller off / Press power"
//   primed  one press has landed, the track appears  "Standby / Hold power for two seconds"
//   holding the track fills over HOLD_MS
//   on      the screen lights, the drone is armed    "Linked / Fly with W A S D"
//
// While the aircraft runs its own power-on the screen says so instead. That is the sequence
// on the airframe, not on the controller: self test, warm up, link. The keys are live the
// whole way through, because a control that ignores you for two seconds after you turned it
// on reads as broken rather than as authentic.
//
// The dial is the spray. On an RC Plus you turn it for rate and press it to start and stop;
// there is no rate to set here, so what is left is the press. The keyboard can toggle the
// same thing from anywhere on the page, so the aircraft owns the state and the button
// follows it rather than the other way round.
//
// Releasing early drops the track back to zero and stays primed, which is what the real
// hardware does and also what makes the second step a deliberate act rather than a click.
//
// This module writes `data-rc-state` on the root, the `--rc-hold` custom property, and the
// dial's disabled attribute. Every string on the screen is in the markup, so the language
// switcher and tools/gate-i18n-complete.mjs reach all of it and nothing here has to know
// what it says.

const HOLD_MS = 2000;

export function wireController(drone, sound) {
  const root = document.querySelector('[data-rc]');
  const button = root?.querySelector('[data-fly]');
  const sprayer = root?.querySelector('[data-spray]');
  if (!root || !button) return null;

  let state = 'off';
  let holding = false;
  let holdFrom = 0;
  let raf = 0;
  let timer = 0;
  let keyHeld = false;

  const setProgress = (p) => root.style.setProperty('--rc-hold', String(p));

  const enter = (next) => {
    if (state === next) return;
    state = next;
    root.dataset.rcState = next;
  };

  const stopHold = () => {
    if (raf) cancelAnimationFrame(raf);
    if (timer) clearTimeout(timer);
    raf = 0;
    timer = 0;
    holding = false;
    holdFrom = 0;
  };

  const showSpray = (on) => {
    root.dataset.rcSpray = on ? 'on' : 'off';
    sprayer?.setAttribute('aria-pressed', String(on));
  };

  // The dial is dead until the controller is on, for the same reason the real one is. It
  // still tracks the spray while it is dead, because the switch in the chrome can open the
  // booms before the handover and a dial that disagreed with the aircraft would be worse
  // than a dial that is merely unavailable.
  const syncSprayer = () => {
    if (sprayer) sprayer.disabled = state !== 'on';
  };

  const complete = () => {
    stopHold();
    setProgress(1);
    enter('on');
    syncSprayer();
    sound?.holdEnd(true);
    drone?.arm();
  };

  // The timeout is what powers the controller on; the animation frame only draws the track
  // filling. They are separate on purpose: requestAnimationFrame can be throttled to nothing
  // (a background tab, a browser under load, an automated one that never takes focus), and a
  // press-and-hold that silently refuses to finish because frames stopped arriving would be
  // indistinguishable to the visitor from a broken button.
  const startHold = () => {
    if (state !== 'primed' || holding) return;
    holding = true;
    holdFrom = performance.now();
    timer = setTimeout(complete, HOLD_MS);
    // The tone rises for exactly as long as the track fills, so someone holding the button
    // without watching it still knows the hold is counting.
    sound?.holdStart(HOLD_MS);
    const tick = (now) => {
      setProgress(Math.min(1, (now - holdFrom) / HOLD_MS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  // Released before the hold completed: drop the track to zero and stay primed. The drop is
  // instant rather than eased, because an easing here would let a visitor believe a
  // half-finished hold is still counting.
  const endHold = () => {
    if (!holding) return;
    stopHold();
    setProgress(0);
    sound?.holdEnd(false);
  };

  // Step one. A click is a full press and release, so this is the press that primes the
  // controller; in `primed` a click is only the tail of a hold and must not re-fire.
  button.addEventListener('click', (e) => {
    e.preventDefault();
    if (state === 'off') {
      enter('primed');
      sound?.cue('press');
    }
  });

  // Step two. Primary button or first touch only.
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startHold();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(type, endHold);
  }
  // A long press on a touchscreen otherwise raises the selection menu over the hold.
  button.addEventListener('contextmenu', (e) => e.preventDefault());

  // Keyboard. Space and Enter both activate a button and both auto-repeat while held, so the
  // repeat is guarded and the pair is handled here start to finish. preventDefault suppresses
  // the synthetic click, which is why the click handler above never double-fires from the
  // keyboard, and it stops Space scrolling the act out from under the hold.
  button.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (keyHeld) return;
    keyHeld = true;
    if (state === 'off') {
      enter('primed');
      sound?.cue('press');
    } else {
      startHold();
    }
  });
  button.addEventListener('keyup', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    keyHeld = false;
    endHold();
  });

  // The spray. Dead until the controller is on, for the same reason the real one is.
  sprayer?.addEventListener('click', (e) => {
    e.preventDefault();
    if (state !== 'on') return;
    drone?.setSpraying(!drone.spraying);
  });

  if (drone) {
    drone.watchSpray(showSpray);
    drone.onLink = (link) => { root.dataset.rcLink = link; };
  }

  root.dataset.rcState = 'off';
  root.dataset.rcLink = 'gnss';
  syncSprayer();
  setProgress(0);
  return { get state() { return state; }, holdMs: HOLD_MS };
}
