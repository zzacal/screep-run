import { RoomNeeds, makeRoomNeeds } from "types/roomNeeds";

export interface RoomSignals {
  sourceCount: number;
  hasConstruction: boolean;
  sourceDropEnergy: number;
  extensionFillRatio: number;
  extensionCapacity: number;
  idleSpawnCount: number;
  isThreatened: boolean;
  remoteEnabled: boolean;
  repairUrgency: number;
  armedTowerCount: number;
  hasStorage: boolean;
  storageUsedRatio: number;
  containerEnergy: number;
  hasMineralHarvesting: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const computeRoomSignals = (room: Room, isThreatened: boolean, remoteEnabled: boolean): RoomSignals => {
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
    filter: (s): s is StructureExtension | StructureSpawn =>
      s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN,
  });

  let totalCapacity = 0;
  let totalStored = 0;
  for (const structure of energyStructures) {
    totalCapacity += structure.store.getCapacity(RESOURCE_ENERGY);
    totalStored += structure.store.getUsedCapacity(RESOURCE_ENERGY);
  }

  const extensionFillRatio = totalCapacity > 0 ? totalStored / totalCapacity : 0;
  const idleSpawnCount = room.find(FIND_MY_SPAWNS, {
    filter: (spawn) => spawn.spawning == null,
  }).length;

  const damagedStructures = room.find(FIND_STRUCTURES, {
    filter: (s) =>
      s.structureType !== STRUCTURE_WALL &&
      s.structureType !== STRUCTURE_RAMPART &&
      s.hits < s.hitsMax * 0.75,
  });
  const repairUrgency = clamp01(damagedStructures.length / 5);

  const armedTowerCount = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureTower =>
      s.structureType === STRUCTURE_TOWER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
  }).length;

  const storageStructure = room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureStorage => s.structureType === STRUCTURE_STORAGE,
  })[0] as StructureStorage | undefined;
  const hasStorage = storageStructure != null;
  const storageUsedRatio = hasStorage
    ? storageStructure.store.getUsedCapacity(RESOURCE_ENERGY) /
      storageStructure.store.getCapacity(RESOURCE_ENERGY)
    : 0;

  const containers = room.find(FIND_STRUCTURES, {
    filter: (s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER,
  }) as StructureContainer[];
  const containerEnergy = containers.reduce(
    (sum, c) => sum + c.store.getUsedCapacity(RESOURCE_ENERGY),
    0
  );

  const hasMineralHarvesting = (() => {
    const mineral = room.find(FIND_MINERALS)[0];
    if (!mineral || mineral.mineralAmount === 0) return false;
    const hasExtractor = room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_EXTRACTOR,
    }).length > 0;
    if (!hasExtractor) return false;
    return room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_TERMINAL,
    }).length > 0;
  })();

  return {
    sourceCount,
    hasConstruction,
    sourceDropEnergy,
    extensionFillRatio,
    extensionCapacity: totalCapacity,
    idleSpawnCount,
    isThreatened,
    remoteEnabled,
    repairUrgency,
    armedTowerCount,
    hasStorage,
    storageUsedRatio,
    containerEnergy,
    hasMineralHarvesting,
  };
};

export const computeRoomNeeds = (signals: RoomSignals): RoomNeeds => {
  const { extensionFillRatio, extensionCapacity, sourceDropEnergy, hasConstruction, isThreatened, remoteEnabled, repairUrgency, armedTowerCount, hasStorage, storageUsedRatio, hasMineralHarvesting } = signals;

  const harvest = clamp01(0.4 + (1 - extensionFillRatio) * 0.3);

  // Only boost haul need when there is actually energy available to haul.
  // If containers, drops, and storage are all empty the room has nothing to
  // move; spawning a hauler first burns the last available energy on a creep
  // that idles, preventing a harvester from ever starting energy production.
  // Storage >1% counts as haulable: haulers can pull from storage even when
  // containers and drops are momentarily empty (common after a drain cycle).
  const hasHaulableEnergy = signals.containerEnergy > 0 || sourceDropEnergy > 0 ||
    (hasStorage && storageUsedRatio > 0.01);
  const haulFromFill = hasHaulableEnergy && extensionCapacity > 0 ? clamp01((1.0 - extensionFillRatio) * 1.5) : 0;
  const haulFromDrop = clamp01(sourceDropEnergy / 500);
  // When storage exists but is mostly empty, maintain haulers even when extensions are
  // full and no energy is currently dropped — without this floor, haul need collapses to
  // zero and existing haulers are never replaced as they age out, leaving storage empty.
  // Gate on haulable energy for the same bootstrap reason as haulFromFill.
  const haulFromStorage = hasStorage && hasHaulableEnergy ? clamp01((1 - storageUsedRatio) * 0.8) : 0;
  const haul = clamp01(Math.max(haulFromFill, haulFromDrop, haulFromStorage));

  const buildOverflowBoost = clamp01(sourceDropEnergy / 400);
  const build = hasConstruction ? clamp01(0.7 + buildOverflowBoost * 0.3) : 0.0;
  const upgradeOverflowBoost = clamp01(sourceDropEnergy / 400);
  // When storage exists but is below 5% (~50K energy), cap upgrade pressure so
  // the room replaces fewer upgraders and surplus accumulates in storage.
  // Existing upgraders are not killed — the cap only slows replacement as they
  // age out. 5% gives a stable hysteresis band: a 2% floor created tight
  // oscillation (dip below 20K → throttle → recover → full pressure → dip).
  const upgradeCap = hasStorage && storageUsedRatio < 0.05 ? 0.4 : 1.0;
  const upgrade = clamp01((0.4 + extensionFillRatio * 0.4 + upgradeOverflowBoost * 0.4) * upgradeCap);
  const defend = isThreatened && armedTowerCount === 0 ? 1.0 : 0.0;
  const remoteHarvest = remoteEnabled ? 0.5 : 0.0;
  const remoteHaul = remoteEnabled ? 0.5 : 0.0;
  const repair = repairUrgency > 0 ? clamp01(0.4 + repairUrgency * 0.5) : 0.0;
  // 0.3 < 1/TARGET_COVERAGE (0.333) so exactly one mineral harvester is maintained.
  const mineralHarvest = hasMineralHarvesting ? 0.3 : 0.0;

  return makeRoomNeeds({ harvest, haul, build, upgrade, defend, remoteHarvest, remoteHaul, repair, mineralHarvest });
};
