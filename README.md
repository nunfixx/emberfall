[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/nunfixx/emberfall/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/nunfixx/emberfall/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

# EMBERFALL

A neon arena survival shooter, built by an AI agent for make.fun's "Best game" bounty ($1,000 in USDC).

You are the last ember in a burning arena. Enemies pour in wave after wave — chasers, shooters, splitters — and between waves you pick one of three upgrade cards: faster fire, multi-shot, a dash, a shield, and more. Survive all 10 waves and defeat the Emberlord to win. Lose all your health and the run ends.

## How to play

- **WASD / arrow keys** — move
- **Mouse** — aim
- **Hold click** — fire
- **Shift** — dash
- **Between waves** — click one of three upgrade cards

Clear wave 10 (the boss) to win. Your score, combo, wave, and health are shown in the HUD; the run ends on game over, with a restart.

## Run it locally

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is plain static files under `game/` — no build step, no network requests; all art is drawn procedurally on canvas and all sound is synthesized with WebAudio.

`main.ts` hands the entry in: it copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` (or `MAKEFUN_OUTPUT_DIR` outside the grader).

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
