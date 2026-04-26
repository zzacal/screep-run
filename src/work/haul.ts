import { moveToTarget } from "work/utils";
import { CreepRole } from "types/creepRole";

const MIN_SOURCE_DROP_PICKUP = 30;
const MIN_GENERAL_DROP_PICKUP = 50;
const MIN_SOURCE_CONTAINER_PICKUP = 100;

const getPickupTarget = (creep: Creep) => {
  const sourceContainers = creep.room.find(FIND_STRUCTURES, {
    filter: (structure): structure is StructureContainer =>
      structure.structureType === STRUCTURE_CONTAINER &&
      structure.store.getUsedCapacity(RESOURCE_ENERGY) >= MIN_SOURCE_CONTAINER_PICKUP &&
      structure.pos.findInRange(FIND_SOURCES, 1).length > 0,
  });

  const sourceContainerTarget = creep.pos.findClosestByPath(sourceContainers);
  if (sourceContainerTarget) {
    return sourceContainerTarget;
  }

  const sourceDrops = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: (resource) =>
      resource.resourceType === RESOURCE_ENERGY &&
      resource.amount >= MIN_SOURCE_DROP_PICKUP &&
      resource.pos.findInRange(FIND_SOURCES, 2).length > 0,
  });

  const sourceDropTarget = creep.pos.findClosestByPath(sourceDrops);
  if (sourceDropTarget) {
    return sourceDropTarget;
  }

  const dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: (resource) =>
      resource.resourceType === RESOURCE_ENERGY &&
      resource.amount >= MIN_GENERAL_DROP_PICKUP,
  });
  if (dropped) {
    return dropped;
  }

  const containers = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) =>
      ((structure.structureType === STRUCTURE_CONTAINER &&
        structure.pos.findInRange(FIND_SOURCES, 1).length === 0) ||
        structure.structureType === STRUCTURE_STORAGE) &&
      structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
  });

  const anyDrop = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
    filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
  });
  if (anyDrop) {
    return anyDrop;
  }

  return creep.pos.findClosestByPath(containers);
};

const getDeliveryTarget = (creep: Creep) => {
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

  const controller = creep.room.controller;
  if (controller) {
    const sourceLinks = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (structure): structure is StructureLink =>
        structure.structureType === STRUCTURE_LINK &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        structure.pos.getRangeTo(controller) > 4,
    });
    const linkTarget = creep.pos.findClosestByPath(sourceLinks);
    if (linkTarget) {
      return linkTarget;
    }
  }

  if (creep.room.find(FIND_CONSTRUCTION_SITES).length > 0) {
    const builders = creep.room.find(FIND_MY_CREEPS, {
      filter: (worker) =>
        (worker.memory.currentTask === "build" || worker.memory.role === CreepRole.builder) &&
        worker.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    });
    const builderTarget = creep.pos.findClosestByPath(builders);
    if (builderTarget) {
      return builderTarget;
    }
  }

  // Keep the controller-side container topped up to a small buffer so
  // upgraders can draw from the nearest non-source container without walking
  // to storage. Cap at 200 so a single haul load (400 carry at RCL4) fills it
  // in one shot and the hauler still delivers the remainder to storage — this
  // avoids the pre-fix loop where a 500-cap target was drained faster than
  // haulers could fill it, starving storage indefinitely.
  const ctrlContainers = creep.room.find(FIND_STRUCTURES, {
    filter: (s): s is StructureContainer =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.store.getUsedCapacity(RESOURCE_ENERGY) < 200 &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
      s.pos.findInRange(FIND_SOURCES, 1).length === 0,
  });
  const ctrlContainer = creep.pos.findClosestByPath(ctrlContainers);
  if (ctrlContainer) {
    return ctrlContainer;
  }

  const storage = creep.room.find(FIND_STRUCTURES, {
    filter: (structure) =>
      structure.structureType === STRUCTURE_STORAGE &&
      structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });

  const storageTarget = creep.pos.findClosestByPath(storage);
  if (storageTarget) {
    return storageTarget;
  }

  return creep.pos.findClosestByPath(FIND_MY_CREEPS, {
    filter: (c) =>
      (c.memory.currentTask === "upgrade" || c.memory.role === CreepRole.upgrader) &&
      c.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
  });
};

export const haul = (creep: Creep) => {
  if (creep.memory.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
    creep.memory.working = false;
    creep.say("pickup");
  }
  if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
    creep.memory.working = true;
    creep.say("deliver");
  }

  if (!creep.memory.working) {
    const pickupTarget = getPickupTarget(creep);
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

  const target = getDeliveryTarget(creep);
  if (!target) {
    return;
  }

  if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
    moveToTarget(creep, target, "#ffffff");
  }
};
