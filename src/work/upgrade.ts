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
    const source = findReachableSource(creep);
    if (!source) {
      return;
    }

    if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
      moveToTarget(creep, source, "#ffaa00");
    }
  }
};
