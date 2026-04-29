import { findReachableSource, moveToTarget } from "work/utils";

const REPAIR_THRESHOLD = 0.85;

const getRepairPriority = (structure: AnyStructure): number => {
  if (structure.structureType === STRUCTURE_CONTAINER) return 100;
  if (structure.structureType === STRUCTURE_TOWER)     return 80;
  if (structure.structureType === STRUCTURE_ROAD) {
    const nearSource     = structure.pos.findInRange(FIND_SOURCES, 2).length > 0;
    const controller     = Game.rooms[structure.pos.roomName]?.controller;
    const nearController = controller != null && structure.pos.getRangeTo(controller.pos) <= 4;
    return (nearSource || nearController) ? 75 : 40;
  }
  if (
    structure.structureType === STRUCTURE_EXTENSION ||
    structure.structureType === STRUCTURE_SPAWN    ||
    structure.structureType === STRUCTURE_STORAGE
  ) return 60;
  return 30;
};

const getRepairTarget = (creep: Creep): AnyStructure | null => {
  const targets = creep.room.find(FIND_STRUCTURES, {
    filter: (s) =>
      s.structureType !== STRUCTURE_WALL &&
      s.structureType !== STRUCTURE_RAMPART &&
      s.hits < s.hitsMax * REPAIR_THRESHOLD,
  });
  if (targets.length === 0) return null;

  let bestPriority = -1;
  for (const t of targets) {
    const p = getRepairPriority(t);
    if (p > bestPriority) bestPriority = p;
  }

  const sameTier = targets.filter((t) => getRepairPriority(t) === bestPriority);
  sameTier.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
  const mostDamagedRatio = sameTier[0].hits / sameTier[0].hitsMax;
  const mostDamaged = sameTier.filter(
    (t) => Math.abs(t.hits / t.hitsMax - mostDamagedRatio) < 0.01
  );
  return creep.pos.findClosestByPath(mostDamaged) ?? sameTier[0];
};

const getRepairPickupTarget = (creep: Creep) => {
  const localSupply = creep.room.find(FIND_STRUCTURES, {
    filter: (s) =>
      (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
      (s as StructureContainer | StructureStorage).store.getUsedCapacity(RESOURCE_ENERGY) > 0,
  });
  const localTarget = creep.pos.findClosestByPath(localSupply);
  if (localTarget) return localTarget;
  return creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: (r) => r.resourceType === RESOURCE_ENERGY,
  });
};

export const repair = (creep: Creep) => {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
    creep.memory.working = false;
    creep.say("harvest");
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
    creep.memory.working = true;
    creep.say("repair");
  }

  if (creep.memory.working) {
    const target = getRepairTarget(creep);
    if (!target) {
      // Nothing to repair — end the cycle so the task selector can repurpose this creep
      // (e.g. upgrade). Without this, a creep holding energy stays stuck with working=true
      // forever since cycleEnded only fires when the store is empty.
      creep.memory.working = false;
      creep.memory.currentTask = undefined;
      return;
    }
    const result = creep.repair(target);
    if (result === ERR_NOT_IN_RANGE) {
      moveToTarget(creep, target, "#00ff88");
    } else if (result === ERR_NO_BODYPART) {
      creep.memory.working = false;
      creep.drop(RESOURCE_ENERGY);
    }
  } else {
    const pickupTarget = getRepairPickupTarget(creep);
    if (pickupTarget instanceof Resource) {
      if (creep.pickup(pickupTarget) === ERR_NOT_IN_RANGE) moveToTarget(creep, pickupTarget, "#ffaa00");
      return;
    }
    if (pickupTarget) {
      if (creep.withdraw(pickupTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) moveToTarget(creep, pickupTarget, "#ffaa00");
      return;
    }
    const source = findReachableSource(creep);
    if (!source) return;
    if (creep.harvest(source) === ERR_NOT_IN_RANGE) moveToTarget(creep, source, "#ffaa00");
  }
};
