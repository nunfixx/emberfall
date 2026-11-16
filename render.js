// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the
// backdrop colour. All art is drawn procedurally on the canvas: neon shapes, glow,
// particles and panels, no images and no fonts to load.

import { ENEMY, FIELD, FINAL_WAVE, FONT, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const PANEL = { width: 640, line: 32 };
const CARD = { width: 300, height: 210, gap: 28 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const killsLabel = cachedLabel('KILLS ');
  const comboLabel = cachedLabel('x');
  const stars = [];
  let starSeed = 1234567;
  for (let index = 0; index < 90; index += 1) {
    starSeed = (starSeed * 1103515245 + 12345) & 0x7fffffff;
    stars.push({
      x: (starSeed / 0x7fffffff) * FIELD.width,
      y: ((starSeed * 7919) % 0x7fffffff) / 0x7fffffff * FIELD.height,
      size: 1 + ((starSeed >> 8) % 3) * 0.7,
      phase: (starSeed % 100) / 100 * Math.PI * 2,
    });
  }
  let cardRects = [];
  let time = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function drawBackground() {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, '#0d1326');
    gradient.addColorStop(1, PALETTE.field);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= FIELD.width; x += 80) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += 80) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    for (const star of stars) {
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.8 + star.phase));
      context.globalAlpha = twinkle * 0.7;
      context.fillStyle = '#a5b4fc';
      context.fillRect(star.x, star.y, star.size, star.size);
    }
    context.globalAlpha = 1;
  }

  function drawGlow(x, y, radius, color) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function drawEmbers(state) {
    for (const ember of state.embers) {
      if (!ember.active) continue;
      const pulse = 0.7 + 0.3 * Math.sin(time * 5 + ember.x);
      context.save();
      context.globalAlpha = pulse;
      drawGlow(ember.x, ember.y, 18, 'rgba(251,191,36,0.35)');
      context.translate(ember.x, ember.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.ember;
      context.fillRect(-5, -5, 10, 10);
      context.restore();
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const def = ENEMY[enemy.kind];
      context.save();
      context.translate(enemy.x, enemy.y);
      drawGlow(0, 0, enemy.radius * 2.2, def.color + '33');
      if (enemy.kind === 'chaser' || enemy.kind === 'mini') {
        context.rotate(Math.atan2(enemy.vy, enemy.vx));
        context.fillStyle = def.color;
        context.beginPath();
        const spikes = enemy.kind === 'mini' ? 6 : 8;
        for (let index = 0; index < spikes * 2; index += 1) {
          const angle = (index / (spikes * 2)) * Math.PI * 2;
          const radius = index % 2 === 0 ? enemy.radius : enemy.radius * 0.55;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.fillStyle = def.core;
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.35, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === 'shooter') {
        context.rotate(time * 0.8);
        context.fillStyle = def.color;
        context.beginPath();
        context.moveTo(0, -enemy.radius);
        context.lineTo(enemy.radius, 0);
        context.lineTo(0, enemy.radius);
        context.lineTo(-enemy.radius, 0);
        context.closePath();
        context.fill();
        context.fillStyle = def.core;
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.3, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === 'splitter') {
        context.fillStyle = def.color;
        context.beginPath();
        context.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = def.core;
        context.beginPath();
        context.arc(-enemy.radius * 0.3, -enemy.radius * 0.2, enemy.radius * 0.28, 0, Math.PI * 2);
        context.arc(enemy.radius * 0.35, enemy.radius * 0.25, enemy.radius * 0.28, 0, Math.PI * 2);
        context.fill();
      } else if (enemy.kind === 'boss') {
        context.rotate(time * 0.5);
        context.fillStyle = def.color;
        context.beginPath();
        for (let index = 0; index < 6; index += 1) {
          const angle = (index / 6) * Math.PI * 2;
          const px = Math.cos(angle) * enemy.radius;
          const py = Math.sin(angle) * enemy.radius;
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.rotate(-time * 0.5);
        context.fillStyle = def.core;
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.42, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = def.color;
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.2, 0, Math.PI * 2);
        context.fill();
      }
      if (enemy.maxHp > 4 && enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
        context.fillStyle = '#1e293b';
        context.fillRect(-enemy.radius, -enemy.radius - 12, enemy.radius * 2, 5);
        context.fillStyle = '#f87171';
        context.fillRect(-enemy.radius, -enemy.radius - 12, enemy.radius * 2 * (enemy.hp / enemy.maxHp), 5);
      }
      context.restore();
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    context.save();
    context.translate(player.x, player.y);
    drawGlow(0, 0, 44, 'rgba(34,211,238,0.30)');
    if (player.shield) {
      context.strokeStyle = '#93c5fd';
      context.lineWidth = 2.5;
      context.globalAlpha = 0.8 + 0.2 * Math.sin(time * 4);
      context.beginPath();
      context.arc(0, 0, player.radius + 10, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
    const flame = 10 + Math.random() * 8;
    context.rotate(player.angle);
    context.fillStyle = '#fb923c';
    context.beginPath();
    context.moveTo(-player.radius * 0.7, 5);
    context.lineTo(-player.radius * 0.7 - flame, 0);
    context.lineTo(-player.radius * 0.7, -5);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(player.radius + 6, 0);
    context.lineTo(-player.radius * 0.8, player.radius * 0.75);
    context.lineTo(-player.radius * 0.4, 0);
    context.lineTo(-player.radius * 0.8, -player.radius * 0.75);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.playerCore;
    context.beginPath();
    context.arc(2, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawBullets(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      drawGlow(bullet.x, bullet.y, 14, 'rgba(103,232,249,0.5)');
      context.fillStyle = '#cffafe';
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      context.fill();
    }
    for (const ebullet of state.ebullets) {
      if (!ebullet.active) continue;
      drawGlow(ebullet.x, ebullet.y, 16, 'rgba(244,114,182,0.5)');
      context.fillStyle = PALETTE.ebullet;
      context.beginPath();
      context.arc(ebullet.x, ebullet.y, ebullet.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fce7f3';
      context.beginPath();
      context.arc(ebullet.x, ebullet.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.globalAlpha = 1;
  }

  function drawTexts(state) {
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    for (const item of state.texts) {
      if (!item.active) continue;
      context.globalAlpha = Math.max(0, item.life / item.maxLife);
      context.font = `bold 17px ${FONT}`;
      context.fillStyle = item.color;
      context.fillText(item.value, item.x, item.y);
    }
    context.globalAlpha = 1;
  }

  function drawHeart(x, y, size, filled) {
    context.save();
    context.translate(x, y);
    context.scale(size / 20, size / 20);
    context.beginPath();
    context.moveTo(0, 6);
    context.bezierCurveTo(-11, -4, -6, -12, 0, -5);
    context.bezierCurveTo(6, -12, 11, -4, 0, 6);
    context.closePath();
    context.fillStyle = filled ? PALETTE.hp : PALETTE.hpEmpty;
    context.fill();
    context.restore();
  }

  function drawHud(state, ui) {
    const player = state.player;
    context.textBaseline = 'top';
    for (let index = 0; index < player.maxHp; index += 1) {
      drawHeart(36 + index * 30, 32, 22, index < player.hp);
    }
    text(scoreLabel(state.score), 24, 62, 26, PALETTE.text, 'left', 'bold ');
    if (state.combo > 1) {
      const mult = (1 + Math.min(state.combo, 20) * 0.1).toFixed(1);
      text(`COMBO ${comboLabel(mult)}  (${state.combo})`, 24, 94, 20, PALETTE.combo, 'left', 'bold ');
      context.fillStyle = '#2a3040';
      context.fillRect(24, 120, 120, 6);
      context.fillStyle = PALETTE.combo;
      context.fillRect(24, 120, 120 * (state.comboTimer / 3.5), 6);
    }
    const waveText = state.wave >= FINAL_WAVE ? `WAVE ${state.wave} — FINAL` : waveLabel(state.wave);
    text(waveText, FIELD.width / 2, 34, 24, PALETTE.text, 'center', 'bold ');
    const remaining = state.enemiesLeft;
    text(remaining === 1 ? '1 enemy left' : `${remaining} enemies left`, FIELD.width / 2, 62, 16, PALETTE.muted, 'center');
    if (state.boss) {
      const width = 420;
      const x = (FIELD.width - width) / 2;
      text('EMBERLORD', FIELD.width / 2, 88, 16, '#fda4af', 'center', 'bold ');
      context.fillStyle = '#1e293b';
      context.fillRect(x, 108, width, 10);
      context.fillStyle = '#f43f5e';
      context.fillRect(x, 108, width * Math.max(0, state.boss.hp / state.boss.maxHp), 10);
    }
    text(`EMBERS ${state.embersCollected}`, FIELD.width - 24, 20, 18, PALETTE.ember, 'right', 'bold ');
    const dashReady = player.dashCooldown <= 0;
    text(dashReady ? 'DASH READY [SHIFT]' : 'DASH …', FIELD.width - 24, 46, 16, dashReady ? PALETTE.player : PALETTE.muted, 'right');
    if (!dashReady) {
      context.fillStyle = '#2a3040';
      context.fillRect(FIELD.width - 144, 68, 120, 6);
      context.fillStyle = PALETTE.player;
      context.fillRect(FIELD.width - 144, 68, 120 * (1 - player.dashCooldown / player.dashCooldownMax), 6);
    }
    if (player.shield) text('AEGIS SHIELD', FIELD.width - 24, 78, 16, '#93c5fd', 'right', 'bold ');
    if (ui && ui.muted) text('MUTED [M]', FIELD.width - 24, 104, 14, PALETTE.muted, 'right');
    if (ui && ui.aim) {
      context.strokeStyle = 'rgba(238,241,245,0.7)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(ui.aim.x, ui.aim.y, 10, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(ui.aim.x - 14, ui.aim.y);
      context.lineTo(ui.aim.x - 6, ui.aim.y);
      context.moveTo(ui.aim.x + 6, ui.aim.y);
      context.lineTo(ui.aim.x + 14, ui.aim.y);
      context.moveTo(ui.aim.x, ui.aim.y - 14);
      context.lineTo(ui.aim.x, ui.aim.y - 6);
      context.moveTo(ui.aim.x, ui.aim.y + 6);
      context.lineTo(ui.aim.x, ui.aim.y + 14);
      context.stroke();
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = 120 + lines.length * PANEL.line + 64;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7,10,20,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.stroke();
    text(title, FIELD.width / 2, y + 62, 46, PALETTE.text, 'center', 'bold ');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 108 + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.ember, 'center', 'bold ');
  }

  function drawUpgrade(state, ui) {
    context.fillStyle = 'rgba(7,10,20,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 108, 40, PALETTE.text, 'center', 'bold ');
    text('Choose one upgrade — it shapes the rest of the run', FIELD.width / 2, 148, 20, PALETTE.muted, 'center');
    const totalWidth = CARD.width * 3 + CARD.gap * 2;
    const startX = (FIELD.width - totalWidth) / 2;
    const y = 200;
    cardRects = [];
    for (let index = 0; index < state.choices.length; index += 1) {
      const choice = state.choices[index];
      const x = startX + index * (CARD.width + CARD.gap);
      cardRects.push({ x, y, width: CARD.width, height: CARD.height });
      const hovered = ui && ui.hover === index;
      context.save();
      if (hovered) {
        context.shadowColor = choice.color;
        context.shadowBlur = 24;
      }
      context.fillStyle = hovered ? '#1a2340' : PALETTE.panel;
      roundRect(x, y, CARD.width, CARD.height, 14);
      context.fill();
      context.restore();
      context.strokeStyle = choice.color;
      context.lineWidth = hovered ? 3 : 2;
      roundRect(x, y, CARD.width, CARD.height, 14);
      context.stroke();
      context.fillStyle = choice.color;
      context.fillRect(x, y, CARD.width, 8);
      text(`[${index + 1}]`, x + CARD.width / 2, y + 52, 18, PALETTE.muted, 'center', 'bold ');
      text(choice.name, x + CARD.width / 2, y + 96, 24, PALETTE.text, 'center', 'bold ');
      text(choice.desc, x + CARD.width / 2, y + 134, 18, PALETTE.muted, 'center');
      text('Click or press ' + (index + 1), x + CARD.width / 2, y + CARD.height - 24, 15, choice.color, 'center');
    }
    text(`Score ${state.score}   •   Wave ${state.wave} of ${FINAL_WAVE}`, FIELD.width / 2, 470, 20, PALETTE.muted, 'center');
  }

  function drawTitle(state, best) {
    drawPanel('EMBERFALL', [
      'A neon arena survival shooter. Hold the line through 10 waves',
      'and burn down the Emberlord — or be swallowed by the swarm.',
      '',
      'WASD / Arrows — move      Mouse — aim      Hold click — fire',
      'SHIFT — dash through danger      P — pause      M — mute',
      '',
      best > 0 ? bestLabel(best) : 'No runs yet — make the first one count.',
    ], 'Click or press Space to start');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, ui = {}) {
    time += 1 / 60;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground();
    drawEmbers(state);
    drawEnemies(state);
    if (screen !== SCREEN_TITLE) drawPlayer(state);
    drawBullets(state);
    drawTexts(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The swarm will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('GAME OVER', [
        finalLabel(state.score),
        bestLabel(best),
        `Reached wave ${state.wave} of ${FINAL_WAVE}  •  ${killsLabel(state.kills)}`,
        `Best combo x${(1 + Math.min(state.bestCombo, 20) * 0.1).toFixed(1)}`,
      ], 'Press Space or click to play again');
    } else if (screen === SCREEN_VICTORY) {
      drawPanel('VICTORY', [
        'The Emberlord falls. The arena is yours.',
        finalLabel(state.score),
        bestLabel(best),
        `Cleared all ${FINAL_WAVE} waves in ${formatTime(state.elapsed)}`,
        `${killsLabel(state.kills)}  •  Best combo x${(1 + Math.min(state.bestCombo, 20) * 0.1).toFixed(1)}`,
      ], 'Press Space or click to play again');
    }
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60);
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** The upgrade cards' rectangles, from the last upgrade draw, for click picking. */
    cardRects() {
      return cardRects;
    },
  };
}
