// The screenshot scenes behind ?shot=start|play|upgrade|end|victory. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (keep a safe distance, aim at the nearest enemy, fire constantly,
// dash when cornered), so the frame is what a short game really looks like and the
// same seed always gives the same frame. The end scene's pilot never moves, so the
// swarm catches it — as a hurried player is caught.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';

const START_SECONDS = 6;
const LIMIT_SECONDS = 900;
const SAMPLE = 1 / 30;

/**
 * Steer the ship: flee the nearest enemy inside 130px, drift toward the nearest
 * enemy otherwise so the fight stays in frame, and aim at the nearest enemy.
 * Near an edge, steer back toward the middle so the ship stays in the shot.
 */
function autopilot(state) {
  const player = state.player;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  if (!nearest) return { moveX: 0, moveY: 0, aimX: player.x, aimY: player.y - 100, firing: true, dash: false };
  let moveX = 0;
  let moveY = 0;
  if (nearestDistance < 130) {
    moveX = (player.x - nearest.x) / nearestDistance;
    moveY = (player.y - nearest.y) / nearestDistance;
  } else {
    // Chase a point between the nearest enemy and the arena's centre, so the
    // fight stays in the middle of the frame instead of drifting to an edge.
    const targetX = (nearest.x + FIELD.width / 2) / 2;
    const targetY = (nearest.y + FIELD.height / 2) / 2;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const targetDistance = Math.hypot(dx, dy) || 1;
    moveX = (dx / targetDistance) * 0.8;
    moveY = (dy / targetDistance) * 0.8;
  }
  const edge = 150;
  if (player.x < edge) moveX += (edge - player.x) / edge;
  if (player.x > FIELD.width - edge) moveX -= (player.x - (FIELD.width - edge)) / edge;
  if (player.y < edge) moveY += (edge - player.y) / edge;
  if (player.y > FIELD.height - edge) moveY -= (player.y - (FIELD.height - edge)) / edge;
  const length = Math.hypot(moveX, moveY) || 1;
  return {
    moveX: moveX / length,
    moveY: moveY / length,
    aimX: nearest.x,
    aimY: nearest.y,
    firing: true,
    dash: nearestDistance < 55 && player.dashCooldown <= 0,
  };
}

/** Stand still and shoot: the swarm wins, as it should for the end scene. */
function doomedPilot(state) {
  const player = state.player;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  void nearestDistance;
  return {
    moveX: 0, moveY: 0,
    aimX: nearest ? nearest.x : player.x,
    aimY: nearest ? nearest.y : player.y - 100,
    firing: true, dash: false,
  };
}

function centreAim(state) {
  return { moveX: 0, moveY: 0, aimX: FIELD.width / 2, aimY: FIELD.height / 2 - 100, firing: false, dash: false };
}

/**
 * Set `world` to the named scene (start, play, upgrade, end or victory; any other
 * name is start) and return the screen to draw over it and the best score to show.
 * The play scene starts wave 1 and lets the pilot fight; the upgrade scene plays
 * until the first wave is cleared and leaves the three upgrade cards up; the end
 * scene plays until the pilot is overrun.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end' && name !== 'victory') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, centreAim(world.state), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'victory') {
    world.startWave(10);
    const state = world.state;
    state.wave = 10;
    state.score = 24850;
    state.kills = 214;
    state.bestCombo = 14;
    state.elapsed = 642;
    state.player.hp = 3;
    state.player.x = FIELD.width / 2;
    state.player.y = FIELD.height / 2;
    for (let index = 0; index < 26 / STEP; index += 1) world.step(STEP, centreAim(state), true);
    return { screen: SCREEN_VICTORY, best: 24850 };
  }
  world.startWave(1);
  const limit = name === 'end' ? LIMIT_SECONDS : 120;
  const pilot = name === 'end' ? doomedPilot : autopilot;
  let over = false;
  let cleared = false;
  for (let index = 0; index < limit / STEP; index += 1) {
    const events = world.step(STEP, pilot(world.state), false);
    if (events & EVENT_OVER) { over = true; break; }
    if (events & EVENT_WAVE_CLEAR) {
      if (name === 'end') {
        // The doomed pilot keeps going, wave after wave, until the swarm wins.
        world.offerUpgrades();
        world.applyUpgrade(world.state.choices[0].id);
        world.startWave(world.state.wave + 1);
        continue;
      }
      cleared = true;
      break;
    }
    if (events & EVENT_WIN) break;
  }
  if (name === 'upgrade') {
    if (!cleared) {
      // The pilot cleared slowly: keep playing until the wave is done.
      for (let index = 0; index < 120 / STEP; index += 1) {
        const events = world.step(STEP, autopilot(world.state), false);
        if (events & EVENT_WAVE_CLEAR) { cleared = true; break; }
        if (events & EVENT_OVER) break;
      }
    }
    world.offerUpgrades();
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  if (name === 'play') {
    // A lively mid-fight frame: fight on through the waves until wave 3 is thick
    // with enemies, then capture it while the arena is still crowded.
    let steps = 0;
    const cap = 240 / STEP;
    while (steps < cap) {
      if (cleared) {
        world.offerUpgrades();
        world.applyUpgrade(world.state.choices[0].id);
        world.startWave(world.state.wave + 1);
        cleared = false;
      }
      if (world.state.wave >= 3 && world.livingEnemies() >= 6) break;
      const events = world.step(STEP, autopilot(world.state), false);
      steps += 1;
      if (events & EVENT_OVER) { over = true; break; }
      if (events & EVENT_WAVE_CLEAR) cleared = true;
      if (events & EVENT_WIN) break;
    }
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
