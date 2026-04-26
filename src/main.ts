import { CreepManager, SpawnManager } from "managers";
import { ErrorMapper } from "utils/ErrorMapper";
import { computeRoomSignals, computeRoomNeeds } from "needs/roomNeeds";
import { RoomNeeds } from "types/roomNeeds";
import { Affinity } from "types/affinity";
import { TaskName } from "types/taskName";

declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory {
    uuid: number;
    log: any;
    roomFlow?: {
      [roomName: string]: {
        sourceDropHighStreak: number;
      };
    };
    remoteOps?: {
      [homeRoomName: string]: {
        targetRoom?: string;
        pausedUntil?: number;
      };
    };
  }

  interface CreepMemory {
    role: string;
    room: string;
    working: boolean;
    sourceId?: Id<Source>;
    homeRoom?: string;
    remoteRoom?: string;
    affinity?: Affinity;
    currentTask?: TaskName;
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }
}
const spawnManager = new SpawnManager();
const screepManager = new CreepManager(spawnManager);

const findContainerSpot = (room: Room, source: Source): RoomPosition | null => {
  const terrain = room.getTerrain();
  const candidates: RoomPosition[] = [];

  for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
    for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
      if (x === source.pos.x && y === source.pos.y) {
        continue;
      }
      if (x < 1 || x > 48 || y < 1 || y > 48) {
        continue;
      }
      if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
        continue;
      }

      const hasBlockingStructure = room
        .lookForAt(LOOK_STRUCTURES, x, y)
        .some((structure) => structure.structureType !== STRUCTURE_ROAD);
      const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0;
      if (!hasBlockingStructure && !hasSite) {
        candidates.push(new RoomPosition(x, y, room.name));
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const spawn = source.pos.findClosestByPath(FIND_MY_SPAWNS);
  if (!spawn) {
    return candidates[0];
  }

  candidates.sort(
    (a, b) => a.getRangeTo(spawn.pos) - b.getRangeTo(spawn.pos)
  );
  return candidates[0];
};

const planExtensions = (room: Room) => {
  if (!room.controller) return;
  const allowed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] as number;
  const existing = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION,
  }).length;
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (s) => s.structureType === STRUCTURE_EXTENSION,
  }).length;
  if (existing + sites >= allowed) return;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const terrain = room.getTerrain();
  for (let radius = 2; radius <= 6; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) return;
      }
    }
  }
};

const planStructureNearSpawn = (
  room: Room,
  structureType: BuildableStructureConstant,
  minRadius: number,
  maxRadius: number
) => {
  if (!room.controller) return;
  const allowed = CONTROLLER_STRUCTURES[structureType][room.controller.level] as number;
  if (!allowed) return;

  const existing = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === structureType,
  }).length;
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (s) => s.structureType === structureType,
  }).length;
  if (existing + sites >= allowed) return;

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const terrain = room.getTerrain();
  for (let radius = minRadius; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = spawn.pos.x + dx;
        const y = spawn.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, structureType) === OK) return;
      }
    }
  }
};

const planTowers = (room: Room) => planStructureNearSpawn(room, STRUCTURE_TOWER, 2, 5);

const planStorage = (room: Room) => planStructureNearSpawn(room, STRUCTURE_STORAGE, 1, 3);

const planTerminal = (room: Room) => planStructureNearSpawn(room, STRUCTURE_TERMINAL, 1, 6);

const planLabs = (room: Room) => planStructureNearSpawn(room, STRUCTURE_LAB, 2, 7);

const planLinks = (room: Room): void => {
  if (!room.controller) return;
  const allowed = CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.controller.level] as number;
  if (!allowed) return;

  const existingLinks = room.find(FIND_MY_STRUCTURES, {
    filter: (s) => s.structureType === STRUCTURE_LINK,
  });
  const linkSites = room.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: (s) => s.structureType === STRUCTURE_LINK,
  });
  if (existingLinks.length + linkSites.length >= allowed) return;

  const terrain = room.getTerrain();
  const allLinks = [...existingLinks, ...linkSites] as Array<{ pos: RoomPosition }>;
  for (const source of room.find(FIND_SOURCES)) {
    if (source.pos.findInRange(allLinks, 2).length > 0) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = source.pos.x + dx;
        const y = source.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) return;
      }
    }
  }

  // All sources covered — use remaining link budget for a controller-side link
  // so runLinks can deliver energy directly to upgraders (upgrade.ts withdraws
  // from any link within range 3 of the creep).
  if (room.controller.pos.findInRange(allLinks, 3).length === 0) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (dx === 0 && dy === 0) continue;
        const x = room.controller.pos.x + dx;
        const y = room.controller.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_LINK) === OK) return;
      }
    }
  }
};

const runLinks = (room: Room): void => {
  if (!room.controller) return;
  const links = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureLink => s.structureType === STRUCTURE_LINK,
  });
  if (links.length < 2) return;

  const controllerLink = links.reduce((closest, link) =>
    link.pos.getRangeTo(room.controller!) < closest.pos.getRangeTo(room.controller!)
      ? link
      : closest
  );

  for (const link of links) {
    if (link.id === controllerLink.id) continue;
    if (link.cooldown === 0 && link.store.energy > 0) {
      link.transferEnergy(controllerLink);
    }
  }
};

const planSpawn = (room: Room): void => {
  if (room.find(FIND_MY_SPAWNS).length > 0) return;
  const hasSite =
    room.find(FIND_MY_CONSTRUCTION_SITES, {
      filter: (s) => s.structureType === STRUCTURE_SPAWN,
    }).length > 0;
  if (hasSite) return;

  const anchor = room.storage ?? room.controller;
  if (!anchor) return;

  const terrain = room.getTerrain();
  for (let radius = 1; radius <= 8; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = anchor.pos.x + dx;
        const y = anchor.pos.y + dy;
        if (x < 2 || x > 47 || y < 2 || y > 47) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_SPAWN) === OK) return;
      }
    }
  }
};

const planControllerContainer = (room: Room) => {
  const { controller } = room;
  if (!controller?.my) return;

  const hasContainer =
    controller.pos.findInRange(FIND_STRUCTURES, 2, {
      filter: (s) =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.findInRange(FIND_SOURCES, 1).length === 0,
    }).length > 0;
  if (hasContainer) return;

  const hasSite =
    controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 2, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER,
    }).length > 0;
  if (hasSite) return;

  const terrain = room.getTerrain();
  for (let r = 1; r <= 2; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = controller.pos.x + dx;
        const y = controller.pos.y + dy;
        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0) continue;
        if (room.createConstructionSite(x, y, STRUCTURE_CONTAINER) === OK) return;
      }
    }
  }
};

const planSourceContainers = (room: Room) => {
  const sources = room.find(FIND_SOURCES);
  for (const source of sources) {
    const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTAINER,
    }).length > 0;
    if (hasContainer) {
      continue;
    }

    const hasContainerSite = source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {
      filter: (site) => site.structureType === STRUCTURE_CONTAINER,
    }).length > 0;
    if (hasContainerSite) {
      continue;
    }

    const buildSpot = findContainerSpot(room, source);
    if (buildSpot) {
      room.createConstructionSite(buildSpot, STRUCTURE_CONTAINER);
    }
  }
};

const runThreatResponse = (room: Room): boolean => {
  const hostiles = room.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length === 0) {
    return false;
  }

  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: (structure): structure is StructureTower =>
      structure.structureType === STRUCTURE_TOWER,
  });

  for (const tower of towers) {
    const target = tower.pos.findClosestByRange(hostiles);
    if (target) {
      tower.attack(target);
    }
  }

  return true;
};

const runTowerRepair = (room: Room): void => {
  const towers = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureTower =>
      s.structureType === STRUCTURE_TOWER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) > 500,
  });
  if (towers.length === 0) return;

  const damaged = room.find(FIND_STRUCTURES, {
    filter: (s) =>
      s.structureType !== STRUCTURE_WALL &&
      s.structureType !== STRUCTURE_RAMPART &&
      s.hits < s.hitsMax * 0.75,
  });
  if (damaged.length === 0) return;

  const worst = damaged.reduce((a, b) =>
    a.hits / a.hitsMax < b.hits / b.hitsMax ? a : b
  );
  for (const tower of towers) {
    tower.repair(worst);
  }
};

const SOURCE_DROP_WARNING_THRESHOLD = 350;
const SOURCE_DROP_WARNING_STREAK = 3;
const REMOTE_HOSTILE_PAUSE_TICKS = 150;
const ROAD_PLANNER_INTERVAL = 25;
const ROAD_SITE_PLACEMENT_LIMIT = 4;
const MAX_ACTIVE_SITES_PER_ROOM = 14;


const logRoomTuning = (room: Room, needs: RoomNeeds, signals: ReturnType<typeof computeRoomSignals>) => {
  if (Game.time % 25 !== 0) {
    return;
  }

  if (room.find(FIND_MY_SPAWNS).length === 0) {
    return;
  }

  console.log(
    [
      `[room:${room.name}]`,
      `threat=${signals.isThreatened ? 1 : 0}`,
      `sources=${signals.sourceCount}`,
      `drop=${signals.sourceDropEnergy}`,
      `fill=${signals.extensionFillRatio.toFixed(2)}`,
      `needs=harvest:${needs.harvest.toFixed(2)},haul:${needs.haul.toFixed(2)},build:${needs.build.toFixed(2)},upgrade:${needs.upgrade.toFixed(2)},repair:${needs.repair.toFixed(2)},defend:${needs.defend.toFixed(2)}`,
    ].join(" ")
  );
};

const warnOnSustainedSourceOverflow = (room: Room, signals: ReturnType<typeof computeRoomSignals>) => {
  if (Game.time % 25 !== 0) {
    return;
  }

  if (room.find(FIND_MY_SPAWNS).length === 0) {
    return;
  }

  Memory.roomFlow ??= {};
  const roomFlow =
    Memory.roomFlow[room.name] ??
    (Memory.roomFlow[room.name] = { sourceDropHighStreak: 0 });

  if (signals.sourceDropEnergy >= SOURCE_DROP_WARNING_THRESHOLD) {
    roomFlow.sourceDropHighStreak += 1;
  } else {
    roomFlow.sourceDropHighStreak = 0;
  }

  if (roomFlow.sourceDropHighStreak >= SOURCE_DROP_WARNING_STREAK) {
    console.log(
      [
        `[room:${room.name}]`,
        "warning=source_overflow",
        `drop=${signals.sourceDropEnergy}`,
        `streak=${roomFlow.sourceDropHighStreak}`,
        "hint=consider_more_haulers_or_source_links",
      ].join(" ")
    );
  }
};

const getOwnedRooms = (): Room[] =>
  Object.values(Game.rooms).filter(
    (room) => room.controller?.my || room.find(FIND_MY_SPAWNS).length > 0
  );

const getConstructionPriority = (site: ConstructionSite): number => {
  if (site.structureType === STRUCTURE_CONTAINER) {
    return 100;
  }
  if (site.structureType === STRUCTURE_LINK) {
    return 92;
  }
  if (site.structureType === STRUCTURE_EXTENSION) {
    return 90;
  }
  if (site.structureType === STRUCTURE_SPAWN) {
    return 85;
  }
  if (site.structureType === STRUCTURE_TOWER) {
    return 80;
  }
  if (site.structureType === STRUCTURE_STORAGE) {
    return 70;
  }
  if (site.structureType === STRUCTURE_ROAD) {
    const nearSource = site.pos.findInRange(FIND_SOURCES, 2).length > 0;
    const controller = Game.rooms[site.pos.roomName]?.controller;
    const nearController =
      controller != null && site.pos.getRangeTo(controller.pos) <= 4;
    if (nearSource || nearController) {
      return 75;
    }
    return 40;
  }
  return 50;
};

const createRoadSiteAt = (room: Room, x: number, y: number): boolean => {
  if (x < 1 || x > 48 || y < 1 || y > 48) {
    return false;
  }

  const terrain = room.getTerrain();
  if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
    return false;
  }

  const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
  if (structures.some((structure) => structure.structureType !== STRUCTURE_ROAD)) {
    return false;
  }

  const siteExists = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length > 0;
  if (siteExists) {
    return false;
  }

  return room.createConstructionSite(x, y, STRUCTURE_ROAD) === OK;
};

const planRoadsToTargets = (
  room: Room,
  spawn: StructureSpawn,
  targets: RoomPosition[],
  placementLimit: number
): number => {
  let placements = 0;
  for (const target of targets) {
    if (placements >= placementLimit) {
      break;
    }

    const path = room.findPath(spawn.pos, target, {
      ignoreCreeps: true,
      swampCost: 2,
      maxOps: 3000,
    });

    for (const step of path) {
      if (placements >= placementLimit) {
        break;
      }

      if (createRoadSiteAt(room, step.x, step.y)) {
        placements += 1;
      }
    }
  }

  return placements;
};

const planRoadNetwork = (room: Room) => {
  if (Game.time % ROAD_PLANNER_INTERVAL !== 0) {
    return;
  }

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) {
    return;
  }

  const targets: RoomPosition[] = [];
  for (const source of room.find(FIND_SOURCES)) {
    targets.push(source.pos);
  }
  if (room.controller) {
    targets.push(room.controller.pos);
  }

  const remoteRoom = Memory.remoteOps?.[room.name]?.targetRoom;
  if (remoteRoom) {
    const exitDir = Game.map.findExit(room.name, remoteRoom);
    if (typeof exitDir === "number" && exitDir > 0) {
      const exits = room.find(exitDir as FindConstant) as RoomPosition[];
      const exitPos = spawn.pos.findClosestByRange(exits);
      if (exitPos) {
        targets.push(exitPos);
      }
    }
  }

  planRoadsToTargets(room, spawn, targets, ROAD_SITE_PLACEMENT_LIMIT);
};

const enforceActiveConstructionLimit = (room: Room) => {
  const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
  if (sites.length <= MAX_ACTIVE_SITES_PER_ROOM) {
    return;
  }

  const prioritized = [...sites].sort((a, b) => {
    const byPriority = getConstructionPriority(b) - getConstructionPriority(a);
    if (byPriority !== 0) {
      return byPriority;
    }
    return a.progress - b.progress;
  });

  const removable = prioritized.slice(MAX_ACTIVE_SITES_PER_ROOM);
  for (const site of removable) {
    site.remove();
  }
};

const pickRemoteTargetRoom = (homeRoom: Room): string | undefined => {
  Memory.remoteOps ??= {};
  const state =
    Memory.remoteOps[homeRoom.name] ?? (Memory.remoteOps[homeRoom.name] = {});

  if (state.targetRoom) {
    return state.targetRoom;
  }

  const exits = Game.map.describeExits(homeRoom.name);
  if (!exits) {
    return undefined;
  }

  const candidates = Object.values(exits);
  if (candidates.length === 0) {
    return undefined;
  }

  state.targetRoom = candidates[0];
  return state.targetRoom;
};

const evaluateRemoteSafety = (homeRoom: Room, remoteRoomName: string): boolean => {
  Memory.remoteOps ??= {};
  const state =
    Memory.remoteOps[homeRoom.name] ?? (Memory.remoteOps[homeRoom.name] = {});

  if (state.pausedUntil && Game.time < state.pausedUntil) {
    if (state.pausedUntil - Game.time > REMOTE_HOSTILE_PAUSE_TICKS * 10) {
      state.pausedUntil = 0;
    } else {
      return false;
    }
  }

  const remoteRoom = Game.rooms[remoteRoomName];
  if (!remoteRoom) {
    return true;
  }

  const hostiles = remoteRoom.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length > 0) {
    state.pausedUntil = Game.time + REMOTE_HOSTILE_PAUSE_TICKS;
    console.log(
      [
        `[room:${homeRoom.name}]`,
        "warning=remote_hostile",
        `remote=${remoteRoomName}`,
        `pauseUntil=${state.pausedUntil}`,
      ].join(" ")
    );
    return false;
  }

  return true;
};

export const loop = ErrorMapper.wrapLoop(() => {
  screepManager.cleanup();

  const needsByRoom = new Map<string, RoomNeeds>();

  for (const room of getOwnedRooms()) {
    planSpawn(room);
    planStructureNearSpawn(room, STRUCTURE_SPAWN, 2, 6);
    planSourceContainers(room);
    planControllerContainer(room);
    planExtensions(room);
    planTowers(room);
    planStorage(room);
    planTerminal(room);
    planLabs(room);
    planLinks(room);
    planRoadNetwork(room);
    enforceActiveConstructionLimit(room);
    runLinks(room);

    const isThreatened = runThreatResponse(room);
    if (!isThreatened) {
      runTowerRepair(room);
    }
    const remoteTargetRoom = pickRemoteTargetRoom(room);
    const isOverflowing = (Memory.roomFlow?.[room.name]?.sourceDropHighStreak ?? 0) >= SOURCE_DROP_WARNING_STREAK;
    // Block remote ops on overflow only when storage is also nearly full (≥80%).
    // If storage has ample free capacity, source drops are a flow-routing
    // issue — not a capacity crisis — and halting remote mining makes things worse
    // by letting remote creeps die out while the streak persists.
    const roomStorage = room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureStorage => s.structureType === STRUCTURE_STORAGE,
    })[0] as StructureStorage | undefined;
    const storageNearFull = roomStorage == null ||
      roomStorage.store.getUsedCapacity(RESOURCE_ENERGY) / roomStorage.store.getCapacity(RESOURCE_ENERGY) >= 0.8;
    const overflowBlocksRemote = isOverflowing && storageNearFull;
    // Always evaluate remote safety so the stale-pause safety valve fires even
    // when the room has no spawn (energyCapacityAvailable < 300).
    const remoteSafe = remoteTargetRoom != null && evaluateRemoteSafety(room, remoteTargetRoom);
    const canRunRemote =
      !isThreatened &&
      !overflowBlocksRemote &&
      remoteSafe &&
      room.energyCapacityAvailable >= 300;

    const signals = computeRoomSignals(room, isThreatened, canRunRemote);
    const needs = computeRoomNeeds(signals);
    needsByRoom.set(room.name, needs);

    screepManager.maintain(room, needs);

    logRoomTuning(room, needs, signals);
    warnOnSustainedSourceOverflow(room, signals);

    if (remoteTargetRoom && Game.rooms[remoteTargetRoom]) {
      planSourceContainers(Game.rooms[remoteTargetRoom]);
    }

    if (remoteTargetRoom) {
      const remoteRoomObj = Game.rooms[remoteTargetRoom];
      const remoteSources = remoteRoomObj ? remoteRoomObj.find(FIND_SOURCES).length : 1;
      screepManager.maintainRemote(room, remoteTargetRoom, remoteSources, remoteSources, canRunRemote);
    }
  }

  screepManager.work(needsByRoom);
});
