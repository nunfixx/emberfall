// Every tuning number and colour in one place for EMBERFALL, a neon arena survival
// shooter. The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The last wave. Clearing it (its boss) wins the game. */
export const FINAL_WAVE = 10;

export const PLAYER = {
  radius: 16,
  speed: 330,
  accel: 2600,
  drag: 6.5,
  maxHp: 5,
  fireInterval: 0.24,
  bulletSpeed: 760,
  bulletDamage: 1,
  bulletRadius: 5,
  dashSpeed: 900,
  dashTime: 0.16,
  dashCooldown: 2.2,
  invulnerable: 1.2,
  pickupRadius: 70,
};

/** Enemy kinds, each with its own shape, speed, health and score. */
export const ENEMY = {
  chaser: { radius: 17, speed: 150, hp: 3, score: 50, touch: 1, color: '#ff5a3c', core: '#ffb199' },
  shooter: { radius: 19, speed: 105, hp: 4, score: 80, touch: 1, color: '#c084fc', core: '#e9d5ff', keepRange: 280, fireInterval: 2.4, bulletSpeed: 260 },
  splitter: { radius: 26, speed: 95, hp: 7, score: 100, touch: 1, color: '#4ade80', core: '#bbf7d0' },
  mini: { radius: 10, speed: 215, hp: 1, score: 25, touch: 1, color: '#fb923c', core: '#ffedd5' },
  boss: { radius: 58, speed: 62, hp: 260, score: 2000, touch: 2, color: '#f43f5e', core: '#fecdd3', burstInterval: 3.1, spawnInterval: 6.5 },
};

export const BULLET = { radius: 5, life: 1.1 };
export const EBULLET = { radius: 7, life: 6 };

/** A kill keeps the combo alive this long; each kill inside the window raises it by one. */
export const COMBO = { window: 3.5, max: 20, perKill: 0.1 };

/** Embers enemies drop: score each, and every EMBERS_PER_HEAL collected heals 1 HP. */
export const EMBER = { value: 10, perHeal: 20, radius: 8, magnetSpeed: 520 };

/** How many of each thing can exist at once; pools are allocated once, at boot. */
export const POOLS = { bullets: 128, enemies: 96, ebullets: 128, particles: 512, texts: 48, embers: 192 };

/**
 * What each wave throws at the player. Counts grow with the wave; shooters join from
 * wave 2, splitters from wave 3, and wave 10 is the boss plus a trickle of chasers.
 */
export function waveComposition(wave) {
  if (wave >= FINAL_WAVE) return { boss: 1, chaser: 6, shooter: 2, splitter: 1 };
  return {
    chaser: 5 + wave * 2,
    shooter: wave >= 2 ? 1 + wave : 0,
    splitter: wave >= 3 ? Math.floor(wave / 2) : 0,
  };
}

/** Seconds between spawns inside a wave, shrinking as waves get harder. */
export function spawnInterval(wave) {
  return Math.max(0.35, 0.9 - wave * 0.05);
}

export const UPGRADES = [
  { id: 'rapid', name: 'Rapid Chamber', desc: '+25% fire rate', color: '#22d3ee', max: 5 },
  { id: 'twin', name: 'Twin Barrels', desc: '+1 projectile per shot', color: '#f472b6', max: 3 },
  { id: 'heavy', name: 'Heavy Rounds', desc: '+1 bullet damage', color: '#fb923c', max: 5 },
  { id: 'swift', name: 'Swift Boots', desc: '+15% move speed', color: '#4ade80', max: 4 },
  { id: 'hull', name: 'Reinforced Hull', desc: '+2 max HP and heal 2', color: '#facc15', max: 4 },
  { id: 'dash', name: 'Dash Recharge', desc: 'Dash recharges 35% faster', color: '#818cf8', max: 3 },
  { id: 'pierce', name: 'Piercing Rounds', desc: 'Bullets pierce +1 enemy', color: '#e879f9', max: 3 },
  { id: 'magnet', name: 'Ember Magnet', desc: 'Pickup radius x2', color: '#2dd4bf', max: 3 },
  { id: 'aegis', name: 'Aegis Shield', desc: 'Block one hit each wave', color: '#93c5fd', max: 1 },
  { id: 'overclock', name: 'Overclock', desc: '+15% fire rate, +10% speed', color: '#fda4af', max: 4 },
];

export const PALETTE = {
  backdrop: '#070a14',
  field: '#0b1020',
  grid: '#141c33',
  player: '#22d3ee',
  playerCore: '#ecfeff',
  bullet: '#67e8f9',
  ebullet: '#f472b6',
  ember: '#fbbf24',
  text: '#eef1f5',
  muted: '#8b93a3',
  panel: '#131a2e',
  panelEdge: '#2b3a5e',
  hp: '#fb7185',
  hpEmpty: '#2a3040',
  combo: '#fbbf24',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberfall.best';
