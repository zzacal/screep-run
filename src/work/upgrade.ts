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
    // Always target the controller-side link — same selection as runLinks uses —
    // so upgraders stay anchored near the controller instead of draining the
    // source link and making a 25-tile round trip back.
    const energisedLinks = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureLink =>
        s.structureType === STRUCTURE_LINK && (s as StructureLink).store.energy > 0,
    }) as StructureLink[];
    const controllerLink = energisedLinks.reduce<StructureLink | undefined>(
      (best, link) =>
        !best || link.pos.getRangeTo(creep.room.controller!) < best.pos.getRangeTo(creep.room.controller!)
          ? link
          : best,
      undefined
    );

    if (controllerLink) {
      if (creep.withdraw(controllerLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveToTarget(creep, controllerLink, "#ffaa00");
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

    const storage = creep.room.storage;
    if (storage && storage.store.getUsedCapacity(RESOURCE_ENERGY) >= 200) {
      if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        moveToTarget(creep, storage, "#ffaa00");
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
