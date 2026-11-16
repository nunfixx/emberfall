// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between six screens: title, play, upgrade, paused, game over
// and victory. Sounds fire on the world's events; the first gesture unlocks audio.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|upgrade|end|victory (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_DASH, EVENT_ENEMY_SHOOT, EVENT_HEAL, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_SHIELD, EVENT_SHOOT, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_VICTORY } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { hover: name === 'upgrade' ? 1 : -1 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  let dashQueued = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Wave 1. Hold click to fire.');
  }

  function finishRun(victory) {
    screen = victory ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (victory) {
      audio.victory();
      announce(`Victory. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.gameOver();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function pickUpgrade(index) {
    const choices = world.state.choices;
    if (index < 0 || index >= choices.length) return;
    const choice = choices[index];
    world.applyUpgrade(choice.id);
    audio.upgrade();
    world.startWave(world.state.wave + 1);
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}. ${choice.name} taken.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    // Clicks are consumed every frame and only used on the upgrade screen, so a
    // firing click from play never lands on a card the moment a wave clears.
    const clicks = input.takeClicks();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pickUpgrade(0);
      else if (actions & ACTION_PICK_2) pickUpgrade(1);
      else if (actions & ACTION_PICK_3) pickUpgrade(2);
      else {
        for (const click of clicks) {
          const rects = renderer.cardRects();
          for (let index = 0; index < rects.length; index += 1) {
            const rect = rects[index];
            if (click.x >= rect.x && click.x <= rect.x + rect.width && click.y >= rect.y && click.y <= rect.y + rect.height) {
              pickUpgrade(index);
              break;
            }
          }
        }
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_DASH) dashQueued = true;
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 360, firing: false, dash: false }, true);
      return;
    }
    const move = input.move();
    const aim = input.aim();
    const ctrl = {
      moveX: move.x,
      moveY: move.y,
      aimX: aim.x,
      aimY: aim.y,
      firing: input.firing(),
      dash: dashQueued,
    };
    dashQueued = false;
    const events = world.step(STEP, ctrl, false);
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_ENEMY_SHOOT) audio.enemyShoot();
    if (events & EVENT_KILL) audio.explode();
    else if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_SHIELD) audio.heal();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_HEAL) audio.heal();
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_WAVE_CLEAR) {
      audio.waveClear();
      world.offerUpgrades();
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    } else if (events & EVENT_WIN) {
      finishRun(true);
    } else if (events & EVENT_OVER) {
      finishRun(false);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const ui = {
      aim: screen === SCREEN_PLAY ? input.aim() : null,
      muted,
      hover: -1,
    };
    if (screen === SCREEN_UPGRADE) {
      const aim = input.aim();
      const rects = renderer.cardRects();
      for (let index = 0; index < rects.length; index += 1) {
        const rect = rects[index];
        if (aim.x >= rect.x && aim.x <= rect.x + rect.width && aim.y >= rect.y && aim.y <= rect.y + rect.height) {
          ui.hover = index;
          break;
        }
      }
    }
    renderer.draw(world.state, screen, best, ui);
  }

  // Leaving the tab pauses a running game rather than letting the swarm hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberfall. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
