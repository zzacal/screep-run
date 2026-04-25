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
    filter: (structure): structure is StructureExtension =>
      structure.structureType === STRUCTURE_EXTENSION,
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
  };
};

export const computeRoomNeeds = (signals: RoomSignals): RoomNeeds => {
  const { extensionFillRatio, extensionCapacity, sourceDropEnergy, hasConstruction, isThreatened, remoteEnabled, repairUrgency, armedTowerCount } = signals;

  const harvest = clamp01(0.4 + (1 - extensionFillRatio) * 0.3);

  const haulFromFill = extensionCapacity > 0 ? clamp01((1.0 - extensionFillRatio) * 1.5) : 0;
  const haulFromDrop = clamp01(sourceDropEnergy / 500);
  const haul = clamp01(Math.max(haulFromFill, haulFromDrop));

  const build = hasConstruction ? 0.7 : 0.0;
  const upgrade = clamp01(0.4 + extensionFillRatio * 0.4);
  const defend = isThreatened && armedTowerCount === 0 ? 1.0 : 0.0;
  const remoteHarvest = remoteEnabled ? 0.5 : 0.0;
  const remoteHaul = remoteEnabled ? 0.5 : 0.0;
  const repair = repairUrgency > 0 ? clamp01(0.4 + repairUrgency * 0.5) : 0.0;

  return makeRoomNeeds({ harvest, haul, build, upgrade, defend, remoteHarvest, remoteHaul, repair });
};
