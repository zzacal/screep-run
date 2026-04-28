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
    // Always target the controller-side link (the one closest to the controller
    // by position) so the upgrader stays anchored near the controller.  Selecting
    // by position first and checking energy second prevents the creep from trekking
    // to a source link 25+ tiles away when the controller link is momentarily dry.
    const allLinks = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureLink => s.structureType === STRUCTURE_LINK,
    }) as StructureLink[];
    const controllerLink = allLinks.reduce<StructureLink | undefined>(
      (best, link) =>
        !best || link.pos.getRangeTo(creep.room.controller!) < best.pos.getRangeTo(creep.room.controller!)
          ? link
          : best,
      undefined
    );

    if (controllerLink && controllerLink.store.energy > 0) {
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
