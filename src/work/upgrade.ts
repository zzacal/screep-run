import { findReachableSource, moveToTarget } from "work/utils";

export const upgrade = (creep: Creep) => {
  if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
    creep.memory.working = false;
    creep.say("harvest");
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() == 0) {
    creep.memory.working = true;
    creep.say("upgrade");
  }

  if (creep.memory.working) {
    if (creep.upgradeController(creep.room.controller!) == ERR_NOT_IN_RANGE) {
      moveToTarget(creep, creep.room.controller!, "#ffffff");
    }
  } else {
    const nearbyLink = creep.pos.findInRange(FIND_MY_STRUCTURES, 3, {
      filter: (s): s is StructureLink =>
        s.structureType === STRUCTURE_LINK && (s as StructureLink).store.energy > 0,
    })[0] as StructureLink | undefined;

    if (nearbyLink) {
      if (creep.withdraw(nearbyLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveToTarget(creep, nearbyLink, "#ffaa00");
      }
      return;
    }

    const ctrlContainer = creep.room.find(FIND_STRUCTURES, {
      filter: (s): s is StructureContainer =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) >= 50 &&
        s.pos.findInRange(FIND_SOURCES, 1).length === 0,
    })[0] as StructureContainer | undefined;

    if (ctrlContainer) {
      if (creep.withdraw(ctrlContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveToTarget(creep, ctrlContainer, "#ffaa00");
      }
      return;
    }

    const source = findReachableSource(creep);
    if (!source) {
      return;
    }

    if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
      moveToTarget(creep, source, "#ffaa00");
    }
  }
};
