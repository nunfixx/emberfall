// Procedural sound: every effect and the music loop are built from WebAudio
// oscillators and noise, so the game ships no audio files and makes no network
// request. Everything is guarded: with no user gesture yet (or in a headless
// screenshot run) the context stays suspended and every call is a silent no-op.

const MUSIC_BPM = 132;
const BASS_LINE = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];
const ARP_NOTES = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 174.61];

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let stepIndex = 0;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      context = null;
    }
    return context;
  }

  /** Call from any user gesture: starts the context and the music loop. */
  function unlock() {
    const ctx = ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!musicTimer) {
      const stepSeconds = 60 / MUSIC_BPM / 2;
      musicTimer = window.setInterval(() => {
        if (!context || context.state !== 'running' || muted) return;
        const now = context.currentTime;
        const bass = BASS_LINE[stepIndex % BASS_LINE.length];
        if (bass > 0) tone('triangle', bass, stepSeconds * 0.95, 0.5, musicGain, now);
        if (stepIndex % 2 === 0) {
          const arp = ARP_NOTES[(stepIndex / 2) % ARP_NOTES.length];
          tone('square', arp, stepSeconds * 0.5, 0.08, musicGain, now);
        }
        stepIndex += 1;
      }, (60 / MUSIC_BPM / 2) * 1000);
    }
  }

  function tone(type, frequency, duration, volume, destination, when = 0) {
    if (!context || context.state !== 'running' || muted) return;
    try {
      const start = when || context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(destination || master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function sweep(type, from, to, duration, volume) {
    if (!context || context.state !== 'running' || muted) return;
    try {
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(duration, volume, lowpass) {
    if (!context || context.state !== 'running' || muted) return;
    try {
      const start = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock,
    shoot() { tone('square', 880 + Math.random() * 120, 0.07, 0.1); },
    enemyShoot() { tone('sawtooth', 220, 0.12, 0.07); },
    hit() { noise(0.08, 0.18, 2400); tone('triangle', 180, 0.08, 0.14); },
    explode() { noise(0.35, 0.3, 1200); sweep('sine', 220, 40, 0.35, 0.25); },
    pickup() { tone('sine', 660, 0.08, 0.12); tone('sine', 990, 0.1, 0.1, null, context ? context.currentTime + 0.06 : 0); },
    heal() { tone('sine', 523.25, 0.12, 0.12); tone('sine', 783.99, 0.16, 0.12, null, context ? context.currentTime + 0.09 : 0); },
    dash() { noise(0.14, 0.14, 3200); },
    hurt() { sweep('sawtooth', 320, 70, 0.3, 0.25); noise(0.2, 0.2, 900); },
    waveClear() { [523.25, 659.25, 783.99].forEach((f, i) => tone('triangle', f, 0.18, 0.16, null, context ? context.currentTime + i * 0.09 : 0)); },
    upgrade() { [392, 523.25, 659.25, 783.99].forEach((f, i) => tone('triangle', f, 0.2, 0.15, null, context ? context.currentTime + i * 0.07 : 0)); },
    gameOver() { [392, 311.13, 233.08, 155.56].forEach((f, i) => tone('triangle', f, 0.35, 0.18, null, context ? context.currentTime + i * 0.16 : 0)); },
    victory() { [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone('triangle', f, 0.3, 0.16, null, context ? context.currentTime + i * 0.11 : 0)); },
    click() { tone('sine', 1200, 0.04, 0.08); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
  };
}
