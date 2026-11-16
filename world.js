// The game's rules and state, with no drawing and no browser in it: the player's
// ship, bullets, enemies in escalating waves, upgrades between waves, embers, the
// combo multiplier, score and the boss. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react (sound, screens) without the
// world knowing about screens or sound. Pools are allocated once, at boot.

import {
  BULLET, COMBO, EBULLET, EMBER, ENEMY, FIELD, FINAL_WAVE, PALETTE, PLAYER,
  POOLS, spawnInterval, UPGRADES, waveComposition,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_HEAL = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_WIN = 64;
export const EVENT_OVER = 128;
export const EVENT_DASH = 256;
export const EVENT_SHIELD = 512;
export const EVENT_ENEMY_SHOOT = 1024;

function circleHit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

function freeSlot(pool) {
  for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
  return null;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, radius: PLAYER.radius,
    angle: -Math.PI / 2, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, fireTimer: 0,
    dashTime: 0, dashCooldown: 0, invuln: 0, shield: false,
    fireInterval: PLAYER.fireInterval, damage: PLAYER.bulletDamage, projectiles: 1,
    pierce: 0, bulletSpeed: PLAYER.bulletSpeed, speed: PLAYER.speed,
    pickupRadius: PLAYER.pickupRadius, dashCooldownMax: PLAYER.dashCooldown,
  };
  const bullets = [];
  for (let index = 0; index < POOLS.bullets; index += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: BULLET.radius, life: 0, damage: 1, pierce: 0 });
  }
  const enemies = [];
  for (let index = 0; index < POOLS.enemies; index += 1) {
    enemies.push({ active: false, kind: 'chaser', x: 0, y: 0, vx: 0, vy: 0, radius: 17, hp: 3, maxHp: 3, speed: 150, fireTimer: 0, burstTimer: 0, spawnTimer: 0, wobble: 0, touch: 1 });
  }
  const ebullets = [];
  for (let index = 0; index < POOLS.ebullets; index += 1) {
    ebullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: EBULLET.radius, life: 0 });
  }
  const particles = [];
  for (let index = 0; index < POOLS.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 0 });
  }
  const texts = [];
  for (let index = 0; index < POOLS.texts; index += 1) {
    texts.push({ active: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, value: '', color: '#ffffff' });
  }
  const embers = [];
  for (let index = 0; index < POOLS.embers; index += 1) {
    embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, radius: EMBER.radius, value: EMBER.value });
  }

  const upgradesOwned = {};
  for (const upgrade of UPGRADES) upgradesOwned[upgrade.id] = 0;

  const state = {
    player, bullets, enemies, ebullets, particles, texts, embers,
    score: 0, combo: 0, comboTimer: 0, bestCombo: 0, kills: 0, embersCollected: 0,
    wave: 0, waveState: 'idle', elapsed: 0, shake: 0, boss: null, enemiesLeft: 0,
    choices: [], spawnQueue: [], spawnTimer: 0, ambientTimer: 0, demoAngle: 0,
  };

  function burst(x, y, color, count, speed, size = 3) {
    for (let index = 0; index < count; index += 1) {
      const particle = freeSlot(particles);
      if (!particle) return;
      const angle = random() * Math.PI * 2;
      const velocity = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.4 + random() * 0.5;
      particle.life = particle.maxLife;
      particle.size = size * (0.6 + random() * 0.8);
      particle.color = color;
      particle.drag = 3;
    }
  }

  function addText(x, y, value, color) {
    const text = freeSlot(texts);
    if (!text) return;
    text.active = true;
    text.x = x;
    text.y = y;
    text.vy = -46;
    text.maxLife = 0.9;
    text.life = text.maxLife;
    text.value = value;
    text.color = color;
  }

  function dropEmbers(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      const ember = freeSlot(embers);
      if (!ember) return;
      const angle = random() * Math.PI * 2;
      ember.active = true;
      ember.x = x;
      ember.y = y;
      ember.vx = Math.cos(angle) * 120;
      ember.vy = Math.sin(angle) * 120;
    }
  }

  function spawnEnemy(kind, x, y) {
    const enemy = freeSlot(enemies);
    if (!enemy) return null;
    const def = ENEMY[kind];
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = x;
    enemy.y = y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.radius = def.radius;
    enemy.hp = def.hp + Math.floor((state.wave - 1) / 3);
    enemy.maxHp = enemy.hp;
    enemy.speed = def.speed * (1 + (state.wave - 1) * 0.03);
    enemy.fireTimer = 1 + random() * 1.5;
    enemy.burstTimer = 2 + random();
    enemy.spawnTimer = 4 + random() * 2;
    enemy.wobble = random() * Math.PI * 2;
    enemy.touch = def.touch;
    return enemy;
  }

  function spawnPoint() {
    const margin = 40;
    const side = Math.floor(random() * 4);
    let x = margin + random() * (FIELD.width - margin * 2);
    let y = margin + random() * (FIELD.height - margin * 2);
    if (side === 0) y = -30;
    else if (side === 1) y = FIELD.height + 30;
    else if (side === 2) x = -30;
    else x = FIELD.width + 30;
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy < 220 * 220) {
      x = FIELD.width - x;
      y = FIELD.height - y;
    }
    return { x, y };
  }

  function startWave(wave) {
    state.wave = wave;
    state.waveState = 'spawning';
    const composition = waveComposition(wave);
    const queue = [];
    for (const kind of Object.keys(composition)) {
      for (let index = 0; index < composition[kind]; index += 1) queue.push(kind);
    }
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const temp = queue[index];
      queue[index] = queue[other];
      queue[other] = temp;
    }
    state.spawnQueue = queue;
    state.spawnTimer = 0.6;
    state.boss = null;
  }

  function livingEnemies() {
    let count = 0;
    for (const enemy of enemies) if (enemy.active) count += 1;
    return count;
  }

  function multiplier() {
    return 1 + Math.min(state.combo, COMBO.max) * COMBO.perKill;
  }

  function killEnemy(enemy, events) {
    enemy.active = false;
    const def = ENEMY[enemy.kind];
    state.kills += 1;
    state.combo = Math.min(state.combo + 1, COMBO.max);
    state.comboTimer = COMBO.window;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;
    const points = Math.round(def.score * multiplier());
    state.score += points;
    addText(enemy.x, enemy.y - enemy.radius, `+${points}`, state.combo >= 5 ? PALETTE.combo : PALETTE.text);
    burst(enemy.x, enemy.y, def.color, enemy.kind === 'boss' ? 60 : 16, 260, 4);
    burst(enemy.x, enemy.y, def.core, 8, 160, 3);
    dropEmbers(enemy.x, enemy.y, enemy.kind === 'boss' ? 12 : enemy.kind === 'splitter' ? 3 : 1 + (random() < 0.5 ? 1 : 0));
    if (enemy.kind === 'splitter') {
      for (let index = 0; index < 2; index += 1) {
        const mini = spawnEnemy('mini', enemy.x + (index === 0 ? -20 : 20), enemy.y);
        void mini;
      }
    }
    if (enemy.kind === 'boss') state.boss = null;
    return events | EVENT_KILL;
  }

  function hurtPlayer(damage) {
    if (player.invuln > 0 || player.dashTime > 0) return 0;
    if (player.shield) {
      player.shield = false;
      player.invuln = 0.9;
      burst(player.x, player.y, '#93c5fd', 18, 240, 3);
      return EVENT_SHIELD;
    }
    player.hp -= damage;
    player.invuln = PLAYER.invulnerable;
    state.shake = Math.max(state.shake, 12);
    burst(player.x, player.y, PALETTE.hp, 20, 300, 4);
    if (player.hp <= 0) {
      player.hp = 0;
      burst(player.x, player.y, PALETTE.player, 50, 380, 5);
      burst(player.x, player.y, '#ffffff', 20, 200, 3);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireBullet() {
    const count = player.projectiles;
    const spread = 0.16;
    for (let index = 0; index < count; index += 1) {
      const bullet = freeSlot(bullets);
      if (!bullet) break;
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * spread;
      const angle = player.angle + offset;
      bullet.active = true;
      bullet.x = player.x + Math.cos(player.angle) * (player.radius + 8);
      bullet.y = player.y + Math.sin(player.angle) * (player.radius + 8);
      bullet.vx = Math.cos(angle) * player.bulletSpeed;
      bullet.vy = Math.sin(angle) * player.bulletSpeed;
      bullet.life = BULLET.life;
      bullet.damage = player.damage;
      bullet.pierce = player.pierce;
    }
    return EVENT_SHOOT;
  }

  function offerUpgrades() {
    const available = UPGRADES.filter((upgrade) => upgradesOwned[upgrade.id] < upgrade.max);
    const pool = available.length > 0 ? available : UPGRADES;
    const choices = [];
    while (choices.length < 3 && choices.length < pool.length) {
      const pick = pool[Math.floor(random() * pool.length)];
      if (!choices.includes(pick)) choices.push(pick);
    }
    state.choices = choices;
    return choices;
  }

  function applyUpgrade(id) {
    upgradesOwned[id] += 1;
    if (id === 'rapid') player.fireInterval *= 0.8;
    else if (id === 'twin') player.projectiles += 1;
    else if (id === 'heavy') player.damage += 1;
    else if (id === 'swift') player.speed *= 1.15;
    else if (id === 'hull') {
      player.maxHp += 2;
      player.hp = Math.min(player.maxHp, player.hp + 2);
    } else if (id === 'dash') player.dashCooldownMax *= 0.65;
    else if (id === 'pierce') player.pierce += 1;
    else if (id === 'magnet') player.pickupRadius *= 2;
    else if (id === 'aegis') player.shield = true;
    else if (id === 'overclock') {
      player.fireInterval *= 0.87;
      player.bulletSpeed *= 1.1;
    }
    state.choices = [];
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.angle = -Math.PI / 2;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.dashTime = 0;
    player.dashCooldown = 0;
    player.invuln = 0;
    player.shield = false;
    player.fireInterval = PLAYER.fireInterval;
    player.damage = PLAYER.bulletDamage;
    player.projectiles = 1;
    player.pierce = 0;
    player.bulletSpeed = PLAYER.bulletSpeed;
    player.speed = PLAYER.speed;
    player.pickupRadius = PLAYER.pickupRadius;
    player.dashCooldownMax = PLAYER.dashCooldown;
    for (const pool of [bullets, enemies, ebullets, particles, texts, embers]) {
      for (const item of pool) item.active = false;
    }
    for (const upgrade of UPGRADES) upgradesOwned[upgrade.id] = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.bestCombo = 0;
    state.kills = 0;
    state.embersCollected = 0;
    state.wave = 0;
    state.waveState = 'idle';
    state.elapsed = 0;
    state.shake = 0;
    state.boss = null;
    state.choices = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.enemiesLeft = 0;
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) { particle.active = false; continue; }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - particle.drag * dt;
      particle.vy *= 1 - particle.drag * dt;
    }
    for (const text of texts) {
      if (!text.active) continue;
      text.life -= dt;
      if (text.life <= 0) { text.active = false; continue; }
      text.y += text.vy * dt;
    }
  }

  /**
   * One fixed step. `ctrl` carries the frame's control: moveX/moveY (steering),
   * aimX/aimY (mouse aim), firing (mouse held) and dash (pressed this step).
   * With `harmless` set (the title screen's backdrop) embers drift and enemies
   * wander, but nothing fires and nothing can be hurt.
   */
  function step(dt, ctrl, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    updateParticles(dt);

    if (harmless) {
      state.demoAngle += dt * 0.25;
      const demoX = FIELD.width / 2 + Math.cos(state.demoAngle) * 260;
      const demoY = FIELD.height / 2 + Math.sin(state.demoAngle * 1.3) * 160;
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        state.ambientTimer = 0.5;
        const ember = freeSlot(embers);
        if (ember) {
          ember.active = true;
          ember.x = random() * FIELD.width;
          ember.y = FIELD.height + 10;
          ember.vx = (random() - 0.5) * 20;
          ember.vy = -(30 + random() * 40);
        }
        if (livingEnemies() < 5 && random() < 0.6) {
          const point = spawnPoint();
          spawnEnemy(random() < 0.6 ? 'chaser' : 'mini', point.x, point.y);
        }
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const dx = demoX - enemy.x;
        const dy = demoY - enemy.y;
        const length = Math.hypot(dx, dy) || 1;
        enemy.x += (dx / length) * enemy.speed * 0.4 * dt;
        enemy.y += (dy / length) * enemy.speed * 0.4 * dt;
      }
      for (const ember of embers) {
        if (!ember.active) continue;
        ember.x += ember.vx * dt;
        ember.y += ember.vy * dt;
        if (ember.y < -20) ember.active = false;
      }
      return events;
    }

    // --- player movement and dash ---
    const targetVx = ctrl.moveX * player.speed;
    const targetVy = ctrl.moveY * player.speed;
    const blend = 1 - Math.exp(-PLAYER.accel / player.speed * dt * 8);
    player.vx += (targetVx - player.vx) * Math.min(1, blend * 8);
    player.vy += (targetVy - player.vy) * Math.min(1, blend * 8);
    if (player.dashCooldown > 0) player.dashCooldown -= dt;
    if (ctrl.dash && player.dashCooldown <= 0 && player.dashTime <= 0) {
      player.dashTime = PLAYER.dashTime;
      player.dashCooldown = player.dashCooldownMax;
      const dashAngle = (ctrl.moveX !== 0 || ctrl.moveY !== 0)
        ? Math.atan2(ctrl.moveY, ctrl.moveX)
        : player.angle;
      player.vx = Math.cos(dashAngle) * PLAYER.dashSpeed;
      player.vy = Math.sin(dashAngle) * PLAYER.dashSpeed;
      burst(player.x, player.y, PALETTE.player, 10, 200, 3);
      events |= EVENT_DASH;
    }
    if (player.dashTime > 0) player.dashTime -= dt;
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));
    player.angle = Math.atan2(ctrl.aimY - player.y, ctrl.aimX - player.x);
    if (player.invuln > 0) player.invuln -= dt;

    // --- firing ---
    player.fireTimer -= dt;
    if (ctrl.firing && player.fireTimer <= 0) {
      player.fireTimer = player.fireInterval;
      events |= fireBullet();
    }

    // --- wave spawning ---
    if (state.waveState === 'spawning') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        if (state.spawnQueue.length > 0) {
          const kind = state.spawnQueue.shift();
          const point = spawnPoint();
          const enemy = spawnEnemy(kind, point.x, point.y);
          if (kind === 'boss' && enemy) state.boss = enemy;
          state.spawnTimer = spawnInterval(state.wave);
        } else {
          state.waveState = 'fighting';
        }
      }
    }

    // --- enemies ---
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const nx = dx / distance;
      const ny = dy / distance;
      enemy.wobble += dt;
      if (enemy.kind === 'chaser' || enemy.kind === 'mini') {
        const wobble = Math.sin(enemy.wobble * 3) * 0.4;
        enemy.vx = (nx - ny * wobble) * enemy.speed;
        enemy.vy = (ny + nx * wobble) * enemy.speed;
      } else if (enemy.kind === 'splitter') {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
      } else if (enemy.kind === 'shooter') {
        const def = ENEMY.shooter;
        const away = distance < def.keepRange - 40 ? -1 : distance > def.keepRange + 60 ? 1 : 0;
        enemy.vx = nx * enemy.speed * away + -ny * 40 * Math.sin(enemy.wobble);
        enemy.vy = ny * enemy.speed * away + nx * 40 * Math.sin(enemy.wobble);
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0 && distance < 560) {
          enemy.fireTimer = def.fireInterval;
          const ebullet = freeSlot(ebullets);
          if (ebullet) {
            ebullet.active = true;
            ebullet.x = enemy.x;
            ebullet.y = enemy.y;
            ebullet.vx = nx * def.bulletSpeed;
            ebullet.vy = ny * def.bulletSpeed;
            ebullet.life = EBULLET.life;
            events |= EVENT_ENEMY_SHOOT;
          }
        }
      } else if (enemy.kind === 'boss') {
        enemy.vx = nx * enemy.speed;
        enemy.vy = ny * enemy.speed;
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
          enemy.burstTimer = ENEMY.boss.burstInterval;
          const count = 10;
          for (let index = 0; index < count; index += 1) {
            const ebullet = freeSlot(ebullets);
            if (!ebullet) break;
            const angle = (index / count) * Math.PI * 2 + enemy.wobble;
            ebullet.active = true;
            ebullet.x = enemy.x;
            ebullet.y = enemy.y;
            ebullet.vx = Math.cos(angle) * 200;
            ebullet.vy = Math.sin(angle) * 200;
            ebullet.life = EBULLET.life;
          }
          events |= EVENT_ENEMY_SHOOT;
        }
        enemy.spawnTimer -= dt;
        if (enemy.spawnTimer <= 0 && livingEnemies() < 14) {
          enemy.spawnTimer = ENEMY.boss.spawnInterval;
          for (let index = 0; index < 2; index += 1) {
            spawnEnemy('chaser', enemy.x + (index === 0 ? -70 : 70), enemy.y);
          }
        }
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = Math.min(FIELD.width + 60, Math.max(-60, enemy.x));
      enemy.y = Math.min(FIELD.height + 60, Math.max(-60, enemy.y));
    }

    // --- player bullets ---
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      bullet.life -= dt;
      if (bullet.life <= 0) { bullet.active = false; continue; }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        if (!circleHit(bullet, enemy)) continue;
        enemy.hp -= bullet.damage;
        burst(bullet.x, bullet.y, PALETTE.bullet, 4, 140, 2);
        addText(enemy.x, enemy.y - enemy.radius - 6, String(bullet.damage), PALETTE.bullet);
        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          bullet.active = false;
        }
        if (enemy.hp <= 0) events = killEnemy(enemy, events);
        break;
      }
    }

    // --- enemy bullets ---
    for (const ebullet of ebullets) {
      if (!ebullet.active) continue;
      ebullet.life -= dt;
      if (ebullet.life <= 0) { ebullet.active = false; continue; }
      ebullet.x += ebullet.vx * dt;
      ebullet.y += ebullet.vy * dt;
      if (ebullet.x < -20 || ebullet.x > FIELD.width + 20 || ebullet.y < -20 || ebullet.y > FIELD.height + 20) {
        ebullet.active = false;
        continue;
      }
      if (circleHit(ebullet, player)) {
        ebullet.active = false;
        events |= hurtPlayer(1);
        if (events & EVENT_OVER) return events;
      }
    }

    // --- enemy contact ---
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (!circleHit(enemy, player)) continue;
      enemy.hp -= 2;
      enemy.x -= (player.x - enemy.x) * 0.1;
      enemy.y -= (player.y - enemy.y) * 0.1;
      events |= hurtPlayer(enemy.touch);
      if (events & EVENT_OVER) return events;
      if (enemy.hp <= 0) events = killEnemy(enemy, events);
    }

    // --- embers ---
    for (const ember of embers) {
      if (!ember.active) continue;
      const dx = player.x - ember.x;
      const dy = player.y - ember.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < player.pickupRadius) {
        ember.vx += (dx / distance) * EMBER.magnetSpeed * dt * 4;
        ember.vy += (dy / distance) * EMBER.magnetSpeed * dt * 4;
      }
      ember.vx *= 1 - 2 * dt;
      ember.vy *= 1 - 2 * dt;
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      if (distance < player.radius + ember.radius + 4) {
        ember.active = false;
        state.embersCollected += 1;
        state.score += EMBER.value;
        events |= EVENT_PICKUP;
        if (state.embersCollected % EMBER.perHeal === 0 && player.hp < player.maxHp) {
          player.hp += 1;
          addText(player.x, player.y - 30, '+1 HP', PALETTE.hp);
          events |= EVENT_HEAL;
        }
      }
    }

    // --- wave cleared? ---
    if (state.waveState === 'fighting' && livingEnemies() === 0) {
      state.waveState = 'clear';
      if (state.wave >= FINAL_WAVE) {
        events |= EVENT_WIN;
      } else {
        events |= EVENT_WAVE_CLEAR;
      }
    }
    state.enemiesLeft = livingEnemies() + state.spawnQueue.length;
    return events;
  }

  reset();
  return { state, reset, step, startWave, offerUpgrades, applyUpgrade, livingEnemies, multiplier };
}
