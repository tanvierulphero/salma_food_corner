/**
 * Audio Feedback Utility using Web Audio API
 * Generates subtle, elegant, low-latency synthesized sounds
 * without relying on external audio files or network requests.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('salma_sound_feedback') !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('salma_sound_feedback', enabled ? 'true' : 'false');
}

/**
 * Subtle and satisfying "Add to Cart" pop / soft chime
 * Two harmonically pleasant frequencies (D5 -> A5) with gentle exponential decay
 */
export function playAddToCartSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Master gain node to prevent clipping and keep volume gentle
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.14, now);
    masterGain.connect(ctx.destination);

    // Note 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    // Slight pitch bend for bubble/pop feel
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.06);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.7, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc1.connect(gain1);
    gain1.connect(masterGain);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Note 2: 880 Hz (A5) - slightly delayed
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(987.77, now + 0.13);

    gain2.gain.setValueAtTime(0.001, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0.85, now + 0.065);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.19);
  } catch (err) {
    console.debug('Audio feedback error:', err);
  }
}

/**
 * Celebratory, warm and comforting "Order Placed Successfully" chime
 * Ascending 4-tone harmonic arpeggio (C5 -> E5 -> G5 -> C6) with warm decay
 */
export function playOrderSuccessSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, now);
    masterGain.connect(ctx.destination);

    // Chord notes: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.22, gain: 0.6 },
      { freq: 659.25, time: 0.09, dur: 0.24, gain: 0.7 },
      { freq: 783.99, time: 0.18, dur: 0.28, gain: 0.8 },
      { freq: 1046.50, time: 0.27, dur: 0.45, gain: 0.95 }
    ];

    notes.forEach(note => {
      const startTime = now + note.time;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Mix between sine and soft triangle for warmth
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(note.gain, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + note.dur + 0.02);
    });

    // Add a gentle soft high harmonic shimmer at the end
    const shimmerOsc = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    const shimmerStart = now + 0.35;
    shimmerOsc.type = 'triangle';
    shimmerOsc.frequency.setValueAtTime(1318.51, shimmerStart); // E6
    shimmerGain.gain.setValueAtTime(0.001, shimmerStart);
    shimmerGain.gain.linearRampToValueAtTime(0.3, shimmerStart + 0.03);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, shimmerStart + 0.4);

    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(masterGain);
    shimmerOsc.start(shimmerStart);
    shimmerOsc.stop(shimmerStart + 0.42);

  } catch (err) {
    console.debug('Audio feedback error:', err);
  }
}

/**
 * Subtle click for quantity adjustments (+ / -) in cart
 */
export function playCartQuantitySound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {
    console.debug('Audio feedback error:', err);
  }
}
