// Lightweight Web Audio API sound palette — no external files, fully procedural.
// All sounds are short, subtle, and non-intrusive.

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') void _ctx.resume();
    return _ctx;
  } catch {
    return null;
  }
}

/** Play a single oscillator tone that sweeps from `freq` → `endFreq` over `duration` seconds. */
function tone(
  freq: number,
  endFreq: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine',
  startDelay = 0,
) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime + startDelay;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  const hi  = ctx.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);

  hi.type = 'highpass';
  hi.frequency.value = 80;

  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peakGain, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(hi);
  hi.connect(env);
  env.connect(ctx.destination);

  osc.start(t);
  osc.stop(t + duration + 0.02);
}

// ── Named sound events ────────────────────────────────────────────────────────

/** Generic button / click — short, neutral tick. */
export function soundClick() {
  tone(680, 580, 0.07, 0.11, 'sine');
}

/** Opening a panel, modal, or detail view — warm upward sweep. */
export function soundOpen() {
  tone(380, 820, 0.15, 0.10, 'sine');
  tone(760, 960, 0.08, 0.05, 'triangle', 0.05);
}

/** Closing / dismissing a panel — gentle downward sweep. */
export function soundClose() {
  tone(820, 360, 0.12, 0.09, 'sine');
}

/** Tab / segment switch — crisp high tick. */
export function soundTab() {
  tone(1020, 1020, 0.04, 0.08, 'triangle');
}

/** Checkbox / task toggle — two-note confirm. */
export function soundToggle() {
  tone(620, 880, 0.06, 0.10, 'sine');
  tone(880, 1100, 0.05, 0.07, 'sine', 0.07);
}

/** Hover on an interactive row — barely-there tick. */
export function soundHover() {
  tone(1400, 1400, 0.025, 0.035, 'sine');
}

/** Refresh / reload initiated. */
export function soundRefresh() {
  tone(500, 700, 0.09, 0.09, 'sine');
  tone(700, 500, 0.07, 0.05, 'sine', 0.10);
}
