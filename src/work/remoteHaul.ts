import { moveToTarget } from "work/utils";

const moveToRoomCenter = (creep: Creep, roomName: string) => {
  creep.moveTo(new RoomPosition(25, 25, roomName), {
    visualizePathStyle: { stroke: "#66ccff" },
    reusePath: 20,
    maxRooms: 16,
  });
};

const getRemotePickupTarget = (creep: Creep) => {
  const sourceContainers = creep.room.find(FIND_STRUCTURES, {
    filter: (structure): structure is StructureContainer =>
      structure.structureType === STRUCTURE_CONTAINER &&
      structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0 &&
      structure.pos.findInRange(FIND_SOURCES, 1).length > 0,
  });
  const sourceContainerTarget = creep.pos.findClosestByPath(sourceContainers);
  if (sourceContainerTarget) {
    return sourceContainerTarget;
  }

  return creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
  });
};

const getHomeDeliveryTarget = (creep: Creep) => {
  const primary = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) =>
      (structure.structureType === STRUCTURE_SPAWN ||
        structure.structureType === STRUCTURE_EXTENSION) &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
  const primaryTarget = creep.pos.findClosestByPath(primary);
  if (primaryTarget) {
    return primaryTarget;
  }

  const towers = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) =>
      structure.structureType === STRUCTURE_TOWER &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 200,
  });
  const towerTarget = creep.pos.findClosestByPath(towers);
  if (towerTarget) {
    return towerTarget;
  }

  const storage = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) =>
      structure.structureType === STRUCTURE_STORAGE &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });

  return creep.pos.findClosestByPath(storage);
};

export const remoteHaul = (creep: Creep) => {
  const remoteRoom = creep.memory.remoteRoom;
  const homeRoom = creep.memory.homeRoom;
  if (!remoteRoom || !homeRoom) {
    return;
  }

  const pausedUntil = Memory.remoteOps?.[homeRoom]?.pausedUntil ?? 0;
  if (Game.time < pausedUntil) {
    if (creep.room.name !== homeRoom) {
      moveToRoomCenter(creep, homeRoom);
    }
    return;
  }

  if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.working = false;
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
    creep.memory.working = true;
  }

  if (!creep.memory.working) {
    if (creep.room.name !== remoteRoom) {
      moveToRoomCenter(creep, remoteRoom);
      return;
    }

    if (creep.room.find(FIND_HOSTILE_CREEPS).length > 0) {
      moveToRoomCenter(creep, homeRoom);
      return;
    }

    const pickupTarget = getRemotePickupTarget(creep);
    if (!pickupTarget) {
      return;
    }

    if (pickupTarget instanceof Resource) {
      if (creep.pickup(pickupTarget) === ERR_NOT_IN_RANGE) {
        moveToTarget(creep, pickupTarget, "#ffaa00");
      }
      return;
    }

    if (creep.withdraw(pickupTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      moveToTarget(creep, pickupTarget, "#ffaa00");
    }
    return;
  }

  if (creep.room.name !== homeRoom) {
    moveToRoomCenter(creep, homeRoom);
    return;
  }

  const deliveryTarget = getHomeDeliveryTarget(creep);
  if (!deliveryTarget) {
    return;
  }

  if (creep.transfer(deliveryTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    moveToTarget(creep, deliveryTarget, "#ffffff");
  }
};
