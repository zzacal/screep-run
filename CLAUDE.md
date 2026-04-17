# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript and bundle with Rollup
npm run lint           # ESLint on src/
npm run test           # Run Mocha unit tests
npm run test-unit      # Same as test

# Deploy to Screeps servers
npm run push-main      # Build + push to main server
npm run push-sim       # Build + push to simulator
npm run push-pserver   # Build + push to private server

# Watch mode (continuous build + push)
npm run watch-main
```

**Single test:** `npx mocha test/unit/path/to/test.ts`

**Credentials:** Copy `screeps.sample.json` → `screeps.json` and fill in credentials. The `DEST` env var selects the target server (main|pserver|season|sim).

## Architecture

This is a Screeps AI bot — TypeScript that compiles to a single `dist/main.js` bundle uploaded to the Screeps game servers. The game calls `loop()` from `main.ts` every tick.

### Layers

**`src/main.ts`** — Game loop and room orchestration. Each tick it reads room state (`getRoomSignals`), computes desired creep counts (`getRoomTargets`), runs tower threat response, plans infrastructure (source containers, road networks), and calls into `CreepManager`.

**`src/managers/creepManager.ts`** — Core of the bot. Handles:
- Creep body composition scaled by room energy capacity (multiple tiers per role)
- Enforcing desired creep counts via spawning (`maintain`, `maintainRemote`)
- Dispatching each creep to its role's work function (`work`)

**`src/managers/spawnManager.ts`** — Thin wrapper for filtered spawn access.

**`src/work/`** — One module per role, each implementing a two-state machine toggled by `creep.memory.working` (harvesting ↔ performing task):
- `harvest.ts` — Mine sources, fill adjacent containers
- `upgrade.ts` — Harvest then upgrade controller
- `build.ts` — Build with priority: containers > extensions > spawns > towers > storage > roads
- `haul.ts` — Complex pickup/delivery routing (containers, drops, spawns, extensions, storage)
- `defend.ts` — Approach and attack nearest hostile
- `remoteHarvest.ts` / `remoteHaul.ts` — Cross-room harvesting; pause if home room signals danger

**`src/work/utils.ts`** — Shared pathfinding helpers (`findReachableSource`, `findAssignedSource`, `moveToTarget`).

### Key Types

```typescript
enum CreepRole { builder="b", harvester="h", upgrader="u", defender="d", hauler="c", remoteHarvester="rh", remoteHauler="rc" }

// Memory extensions on global Memory
Memory { uuid, log, roomFlow?, remoteOps? }
CreepMemory { role, room, working, sourceId?, homeRoom?, remoteRoom? }
```

### Build System

Rollup bundles `src/main.ts` → `dist/main.js` (CommonJS + source maps). `rollup-plugin-screeps` uploads directly to the game server. `ErrorMapper.ts` uses the source map at runtime to resolve original file locations in stack traces.
