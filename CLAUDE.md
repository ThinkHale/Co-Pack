# Co-Pack -- Claude Code Instructions

## Project Overview
Co-Pack is a contract packaging idle/simulation game. Three builds share one engine:
- `packages/engine` -- pure TypeScript simulation, no UI, no framework
- `packages/web` -- React + Vite web demo (Employbridge branded, GitHub Pages)
- `packages/mobile` -- React Native + Expo (SDK 56) iOS/Android build. Full feature parity with web, native touch UI (tap-to-assign instead of drag), consumes `@copack/engine` from source. Run `npm run dev:mobile`; ship via EAS (see `packages/mobile/README.md`).

## Key Conventions
- Engine is the source of truth. UI packages consume it; they never contain game logic.
- All game state lives in `GameState` (see `packages/engine/src/types.ts`)
- 1 tick = 1 game-minute. 1 shift = 1 operating day = 600 ticks (10 hours). `packages/engine/src/time.ts` is the single source of truth (`TICKS_PER_SHIFT`/`TICKS_PER_DAY`); attendance/payroll/morale fire at `tick % TICKS_PER_SHIFT === 0`.
- `seededRandom()` must be used for all in-engine randomness so scenarios are deterministic.
- Events flow outward from the engine. UI subscribes to events; it never mutates state directly.

## Dev Commands
```bash
npm install          # install all workspaces
npm run dev:web      # start the web dev server (localhost:5173)
npm run build:engine # compile engine to dist/
npm run test:engine  # run engine unit tests
```

## Current Phase
Phase 0 -- validate core loop in browser.
Focus: get the web prototype fun before touching mobile.

## Architecture Diagram
See docs/vision-and-architecture.md

## Important Files
- Engine entry: packages/engine/src/index.ts
- Game loop: packages/engine/src/tick.ts
- Initial state / test data: packages/engine/src/factory.ts
- Web app: packages/web/src/App.tsx
- Web state: packages/web/src/hooks/useGameStore.ts
