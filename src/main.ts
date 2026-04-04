import { CreepManager, SpawnManager } from "managers";
import { ErrorMapper } from "utils/ErrorMapper";

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

type RoomTargets = {
  builders: number;
  harvesters: number;
  upgraders: number;
  defenders: number;
  haulers: number;
};

type RoomSignals = {
  sourceCount: number;
  hasConstruction: boolean;
  sourceDropEnergy: number;
  extensionFillRatio: number;
  idleSpawnCount: number;
};

const SOURCE_DROP_WARNING_THRESHOLD = 350;
const SOURCE_DROP_WARNING_STREAK = 3;
const REMOTE_HOSTILE_PAUSE_TICKS = 150;
const ROAD_PLANNER_INTERVAL = 25;
const ROAD_SITE_PLACEMENT_LIMIT = 4;
const MAX_ACTIVE_SITES_PER_ROOM = 14;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getRoomSignals = (room: Room): RoomSignals => {
  const sources = room.find(FIND_SOURCES);
  const sourceCount = sources.length;
  const hasConstruction = room.find(FIND_CONSTRUCTION_SITES).length > 0;

  let sourceDropEnergy = 0;
  for (const source of sources) {
    const drops = source.pos.findInRange(FIND_DROPPED_RESOURCES, 2, {
      filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
    });
    for (const drop of drops) {
      sourceDropEnergy += drop.amount;
    }
  }

  const energyStructures = room.find(FIND_MY_STRUCTURES, {
    filter: (structure): structure is StructureExtension | StructureSpawn =>
      structure.structureType === STRUCTURE_EXTENSION ||
      structure.structureType === STRUCTURE_SPAWN,
  });

  let totalCapacity = 0;
  let totalStored = 0;
  for (const structure of energyStructures) {
    totalCapacity += structure.store.getCapacity(RESOURCE_ENERGY);
    totalStored += structure.store.getUsedCapacity(RESOURCE_ENERGY);
  }
  const extensionFillRatio =
    totalCapacity > 0 ? totalStored / totalCapacity : 0;

  const idleSpawnCount = room.find(FIND_MY_SPAWNS, {
    filter: (spawn) => spawn.spawning == null,
  }).length;

  return {
    sourceCount,
    hasConstruction,
    sourceDropEnergy,
    extensionFillRatio,
    idleSpawnCount,
  };
};

const getRoomTargets = (
  signals: RoomSignals,
  isThreatened: boolean
): RoomTargets => {

  const harvesters = Math.max(1, Math.min(signals.sourceCount, 2));
  let haulers = signals.sourceCount === 1 ? 2 : signals.sourceCount;
  let builders = signals.hasConstruction ? 2 : 1;
  let upgraders = signals.sourceCount === 1 ? 3 : 2;

  if (signals.sourceDropEnergy >= 250) {
    haulers += 1;
  }

  if (signals.extensionFillRatio < 0.5 && signals.idleSpawnCount > 0) {
    haulers += 1;
    upgraders -= 1;
  }

  if (signals.extensionFillRatio > 0.9 && !signals.hasConstruction) {
    upgraders += 1;
  }

  builders = clamp(builders, 1, 3);
  upgraders = clamp(upgraders, 1, 4);
  haulers = clamp(haulers, 1, 4);

  if (isThreatened) {
    return {
      builders: 1,
      harvesters,
      upgraders: 1,
      defenders: 1,
      haulers,
    };
  }

  return {
    builders,
    harvesters,
    upgraders,
    defenders: 0,
    haulers,
  };
};

const logRoomTuning = (
  room: Room,
  signals: RoomSignals,
  targets: RoomTargets,
  isThreatened: boolean
) => {
  if (Game.time % 25 !== 0) {
    return;
  }

  if (room.find(FIND_MY_SPAWNS).length === 0) {
    return;
  }

  console.log(
    [
      `[room:${room.name}]`,
      `threat=${isThreatened ? 1 : 0}`,
      `sources=${signals.sourceCount}`,
      `drop=${signals.sourceDropEnergy}`,
      `fill=${signals.extensionFillRatio.toFixed(2)}`,
      `idleSpawns=${signals.idleSpawnCount}`,
      `targets=b:${targets.builders},h:${targets.harvesters},u:${targets.upgraders},d:${targets.defenders},c:${targets.haulers}`,
    ].join(" ")
  );
};

const warnOnSustainedSourceOverflow = (room: Room, signals: RoomSignals) => {
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
    return false;
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
  //console.log(`Current game tick is ${Game.time}`);
  // Automatically delete memory of missing creeps
  screepManager.cleanup();

  for (const room of getOwnedRooms()) {
    // getStrategy(room: Room) => {
    //   buildings: [STRUCTURE, STRUCTURE, STRUCTURE, STRUCTURE]
    //   builders: #,
    //   harvesters: #,
    //   upgrade: #
    // }: Strategy

    planSourceContainers(room);
    planRoadNetwork(room);
    enforceActiveConstructionLimit(room);
    const isThreatened = runThreatResponse(room);
    const signals = getRoomSignals(room);
    const targets = getRoomTargets(signals, isThreatened);

    screepManager.maintain(
      room,
      targets.builders,
      targets.harvesters,
      targets.upgraders,
      targets.defenders,
      targets.haulers
    );

    logRoomTuning(room, signals, targets, isThreatened);
    warnOnSustainedSourceOverflow(room, signals);

    const remoteTargetRoom = pickRemoteTargetRoom(room);
    if (remoteTargetRoom && Game.rooms[remoteTargetRoom]) {
      planSourceContainers(Game.rooms[remoteTargetRoom]);
    }
    const canRunRemote =
      !isThreatened &&
      remoteTargetRoom != null &&
      room.energyCapacityAvailable >= 300 &&
      signals.extensionFillRatio >= 0.6 &&
      evaluateRemoteSafety(room, remoteTargetRoom);

    if (remoteTargetRoom) {
      screepManager.maintainRemote(room, remoteTargetRoom, 1, 1, canRunRemote);
    }
  }

  screepManager.work();
});
