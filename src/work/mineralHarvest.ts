import { moveToTarget } from "work/utils";

export const mineralHarvest = (creep: Creep) => {
  if (creep.memory.working && creep.store.getUsedCapacity() === 0) {
    creep.memory.working = false;
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
    creep.memory.working = true;
  }

  if (!creep.memory.working) {
    const mineral = creep.room.find(FIND_MINERALS)[0];
    if (!mineral || mineral.mineralAmount === 0) return;

    const result = creep.harvest(mineral);
    if (result === ERR_NOT_IN_RANGE) {
      moveToTarget(creep, mineral, "#cc00ff");
    }
    return;
  }

  const terminal = creep.room.find(FIND_MY_STRUCTURES, {
    filter: (s): s is StructureTerminal => s.structureType === STRUCTURE_TERMINAL,
  })[0];
  const sink: StructureTerminal | StructureStorage | undefined =
    terminal ??
    (creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s): s is StructureStorage => s.structureType === STRUCTURE_STORAGE,
    })[0] as StructureStorage | undefined);

  if (!sink) return;

  const mineral = creep.room.find(FIND_MINERALS)[0];
  const resource = mineral ? mineral.mineralType : (Object.keys(creep.store)[0] as ResourceConstant | undefined);
  if (!resource) return;

  const result = creep.transfer(sink, resource);
  if (result === ERR_NOT_IN_RANGE) {
    moveToTarget(creep, sink, "#cc00ff");
  }
};
