---
name: pserver-tune
description: Inspect the live Screeps pserver game state, identify gaps in the bot's behavior, and improve the code to address them. Use when the user says "check on the pserver", "see what to do next", "tune the bot", or any open-ended prompt asking to move bot progress forward.
allowed-tools: Read, Edit, Write, Grep, Bash(curl:*), Bash(/usr/bin/python3:*), Bash(npm run build), Bash(npm run push-pserver), Bash(mkdir:*), Bash(ls:*), Bash(grep:*)
---

# Pserver Tune

Inspect the live pserver, find concrete gaps between what the bot *does* and what the room *needs*, and implement one targeted improvement per invocation. Prefer shipping a small, verifiable change over redesigning.

## Sandbox notes

This skill runs both locally and in CI via `anthropics/claude-code-action`. The action's Bash sandbox is stricter than a local shell — plan accordingly:

- **No writes outside the repo workdir.** Use `.scratch/` (gitignored) for response bodies, auth dumps, headers. `/tmp/` is blocked.
- **No long `sleep` commands.** Do not try to `sleep N && curl ...` to wait for a push to propagate. Verification happens on the *next* invocation.
- **Keep bash one-liners simple.** Prefer separate `curl -o <file>` calls, then read the file with `Read` or parse with `python3`. Avoid compound commands with `&&`, heredocs-with-comments, or shell expansions that trip validation.
- **Be decisive with turn budget.** `--max-turns` is bounded. Don't retry failing commands; switch approach. If a curl fails, re-auth once and move on.

Run `mkdir -p .scratch` once at the start.

## Step 1 — Read credentials

`screeps.json` is gitignored and lives at the repo root. The `pserver` entry has `hostname`, `port`, `email`, `password`, and `branch`. Read it with the `Read` tool; do not commit it.

## Step 2 — Auth and fetch state

Write the auth response to a file, then parse it:

```bash
curl -s -X POST http://<HOST>:<PORT>/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"<EMAIL>","password":"<PASS>"}' \
  -o .scratch/auth.json
```

```bash
/usr/bin/python3 -c "import json; print(json.load(open('.scratch/auth.json'))['token'])"
```

Capture the printed token into a shell var in a subsequent step, or just re-parse from the file as needed. Subsequent requests: send `X-Token: $TOKEN` and `X-Username: $TOKEN`. The server sometimes rotates the token back in the `X-Token` response header — if a call 401s, re-auth once and retry. Do not loop retries.

Use `/usr/bin/python3` explicitly — the repo's `.tool-versions` pins a non-default python.

Endpoints (always `-o .scratch/<name>.json`, never stdout-piped):

- `GET /api/user/overview?interval=8&shard=shard0&statName=energyControl` → `rooms` array of owned rooms
- `GET /api/game/room-objects?room=<ROOM>&shard=shard0` → every object in the room (controller, spawn, creeps, structures, sites, dropped energy)
- `GET /api/user/memory?path=&shard=shard0` → the bot's `Memory`. The `data` field is `gz:`-prefixed base64+gzip. Decompress in python:

```python
import base64, gzip, json
raw = json.load(open('.scratch/memory.json'))['data']
mem = json.loads(gzip.decompress(base64.b64decode(raw[3:])))
```

Useful memory keys: `creeps` (per-creep role/affinity/currentTask/working), `roomFlow[room].sourceDropHighStreak`, `remoteOps[room].{targetRoom,pausedUntil}`.

## Step 3 — Report the state

For each owned room, produce a short block covering:

- **Controller** — level, progress toward next RCL, ticks to downgrade
- **Energy** — spawn store, extension fill (count and total), container stores, storage store
- **Defense** — tower count, tower energy, any hostiles
- **Construction** — sites queued by type and progress
- **Creeps** — count by role (from `Memory.creeps[name].role`), current tasks, oldest TTL
- **Flow signals** — `sourceDropHighStreak` (≥3 means chronic overflow), `remoteOps.pausedUntil` vs current game time

Keep the report terse — one line per fact. Surface the anomaly, don't document everything.

## Step 4 — Diagnose gaps

Compare observed structures against `CONTROLLER_STRUCTURES` caps for the current RCL. Common RCL-vs-infra gaps (Screeps):

| Structure | First RCL | Notes |
|-----------|-----------|-------|
| extension | 2 | count scales through RCL8 |
| tower | 3 | 1 at RCL3, 2 at RCL5, 3 at RCL7, 6 at RCL8 |
| storage | 4 | 1 total |
| link | 5 | 2, then 3, then 4, then 6 |
| terminal | 6 | 1 total |
| lab | 6 | scales through RCL8 |
| factory | 7 | 1 total |
| observer / power spawn / nuker | 8 | 1 each |

Cross-reference against `src/main.ts` planners. Currently present: `planSourceContainers`, `planExtensions`, `planTowers`, `planStorage`, `planRoadNetwork`. Anything a room is eligible for but has no planner for is an immediate candidate.

Dynamic problems:

- `sourceDropHighStreak ≥ 3` → overflow. Missing a sink (storage/link), too few haulers, or hauler bodies too small.
- Zero construction sites for many ticks but obvious infra gap → planner missing or gated incorrectly.
- `remoteOps.pausedUntil` in the distant future → remote room hostile; check if bot should switch target rooms.
- Creeps with `currentTask` ≠ `role` for extended periods → task selector scoring may be mis-tuned.
- Build sites not advancing → no builder creep or no energy flow to construction.

## Step 5 — Propose, then implement

Report 1–2 concrete findings and the smallest change that resolves the highest-impact one, then implement and deploy it without waiting for approval. Stay inside the allowed-tools scope.

Codebase patterns:

- **New structure planner** → follow `planStructureNearSpawn` in `src/main.ts`. Register in the main loop alongside existing planners. Downstream (`haul.ts`, `build.ts`, `repair.ts`, `roomNeeds.ts`) already key off `structureType`, so adding a planner is usually enough.
- **Needs/affinity tweak** → `src/needs/roomNeeds.ts` computes per-task needs; `src/work/taskSelector.ts` picks via `need * affinity`. Tuning a floor or threshold there changes behavior globally.
- **Body scaling** → `src/needs/bodyBuilder.ts` scales bodies by `energyCapacityAvailable`. Add a tier if the room has outgrown current tiers.

Build & deploy:

```bash
npm run build
npm run push-pserver
```

**Do not attempt live verification in the same run.** The next invocation will observe the effect. This is a hard rule for CI — attempting to `sleep` and re-query burns turns for no benefit.

## Guardrails

- Never push to `push-main`, `push-season`, or similar — pserver only.
- Don't commit `screeps.json` or `.scratch/`; both are gitignored.
- One change per invocation. If the room has multiple gaps, pick the highest-leverage one, implement, and stop. Leave follow-ups for the next run.
- If no meaningful gap exists, say so and exit — don't invent work.
