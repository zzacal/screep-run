import { moveToTarget } from "work/utils";
import { CreepRole } from "types/creepRole";

const moveToRoomCenter = (creep: Creep, roomName: string) => {
  creep.moveTo(new RoomPosition(25, 25, roomName), {
    visualizePathStyle: { stroke: "#ffcc66" },
    reusePath: 20,
    maxRooms: 16,
  });
};

export const remoteHarvest = (creep: Creep) => {
  const remoteRoom = creep.memory.remoteRoom;
  const homeRoom = creep.memory.homeRoom;
  if (!remoteRoom) {
    return;
  }

  if (homeRoom) {
    const pausedUntil = Memory.remoteOps?.[homeRoom]?.pausedUntil ?? 0;
    if (Game.time < pausedUntil) {
      if (creep.room.name !== homeRoom) {
        moveToRoomCenter(creep, homeRoom);
      }
      return;
    }
  }

  if (
    creep.room.name === remoteRoom &&
    creep.room.find(FIND_HOSTILE_CREEPS).length > 0
  ) {
    if (homeRoom) {
      moveToRoomCenter(creep, homeRoom);
    }
    return;
  }

  if (creep.room.name !== remoteRoom) {
    moveToRoomCenter(creep, remoteRoom);
    return;
  }

  const sourceId = creep.memory.sourceId;
  let source = sourceId ? Game.getObjectById(sourceId) : null;
  if (!source) {
    const claimed = Object.values(Game.creeps)
      .filter(c => c.id !== creep.id && c.memory.remoteRoom === remoteRoom && c.memory.sourceId != null)
      .map(c => c.memory.sourceId as Id<Source>);
    const activeSources = creep.room.find(FIND_SOURCES_ACTIVE);
    const unclaimed = activeSources.filter(s => !claimed.includes(s.id));
    source = creep.pos.findClosestByPath(unclaimed.length > 0 ? unclaimed : activeSources);
    if (source) {
      creep.memory.sourceId = source.id;
    }
  }

  if (!source) {
    return;
  }

  if (!creep.pos.isNearTo(source)) {
    moveToTarget(creep, source, "#ffaa00");
    return;
  }

  const result = creep.harvest(source);
  if (result === ERR_NOT_ENOUGH_RESOURCES) {
    return;
  }

  const sourceContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
    filter: (structure) => structure.structureType === STRUCTURE_CONTAINER,
  })[0] as StructureContainer | undefined;

  if (
    sourceContainer &&
    creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
    creep.pos.isNearTo(sourceContainer)
  ) {
    creep.transfer(sourceContainer, RESOURCE_ENERGY);
    return;
  }

  if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    const adjacentHauler = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: (worker) =>
        (worker.memory.currentTask === "remoteHaul" || worker.memory.role === CreepRole.remoteHauler) &&
        worker.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    })[0];

    if (adjacentHauler) {
      creep.transfer(adjacentHauler, RESOURCE_ENERGY);
      return;
    }
  }

  if (creep.store.getFreeCapacity() === 0) {
    creep.drop(RESOURCE_ENERGY);
  }
};
