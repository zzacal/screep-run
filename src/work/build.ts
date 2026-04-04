import { findReachableSource, moveToTarget } from "work/utils";

const getConstructionPriority = (site: ConstructionSite): number => {
    if (site.structureType === STRUCTURE_CONTAINER) {
        return 100;
    }

    if (site.structureType === STRUCTURE_EXTENSION) {
        return 90;
    }

    if (site.structureType === STRUCTURE_SPAWN) {
        return 85;
    }

    if (site.structureType === STRUCTURE_TOWER) {
        return 80;
    }

    if (site.structureType === STRUCTURE_STORAGE) {
        return 70;
    }

    if (site.structureType === STRUCTURE_ROAD) {
        const nearSource = site.pos.findInRange(FIND_SOURCES, 2).length > 0;
            const controller = Game.rooms[site.pos.roomName]?.controller;
            const nearController =
                controller != null && site.pos.getRangeTo(controller.pos) <= 4;
        if (nearSource || nearController) {
            return 75;
        }
        return 40;
    }

    return 50;
};

const getBuildTarget = (creep: Creep): ConstructionSite | null => {
    const targets = creep.room.find(FIND_CONSTRUCTION_SITES);
    if (targets.length === 0) {
        return null;
    }

    let best: ConstructionSite | null = null;
    let bestPriority = -1;

    for (const target of targets) {
        const priority = getConstructionPriority(target);
        if (priority > bestPriority) {
            bestPriority = priority;
            best = target;
        }
    }

    if (!best) {
        return null;
    }

    const sameTier = targets.filter(
        (target) => getConstructionPriority(target) === bestPriority
    );
    return creep.pos.findClosestByPath(sameTier) ?? creep.pos.findClosestByRange(sameTier);
};

const getBuilderPickupTarget = (creep: Creep) => {
    const localSupply = creep.room.find(FIND_STRUCTURES, {
        filter: (structure) =>
            (structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_STORAGE) &&
            structure.store.getUsedCapacity(RESOURCE_ENERGY) > 0,
    });
    const localTarget = creep.pos.findClosestByPath(localSupply);
    if (localTarget) {
        return localTarget;
    }

    return creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
        filter: (resource) => resource.resourceType === RESOURCE_ENERGY,
    });
};

export const build = (creep: Creep) => {
    if (creep.memory.working && creep.store[RESOURCE_ENERGY] == 0) {
        creep.memory.working = false;
        creep.say("harvest");
  }
    if (!creep.memory.working && creep.store.getFreeCapacity() == 0) {
        creep.memory.working = true;
        creep.say("build");
  }

    if (creep.memory.working) {
        const target = getBuildTarget(creep);
        if (target && creep.build(target) == ERR_NOT_IN_RANGE) {
            moveToTarget(creep, target, "#ffffff");
        }
    } else {
        const pickupTarget = getBuilderPickupTarget(creep);
        if (pickupTarget instanceof Resource) {
            if (creep.pickup(pickupTarget) == ERR_NOT_IN_RANGE) {
                moveToTarget(creep, pickupTarget, "#ffaa00");
            }
            return;
        }

        if (pickupTarget) {
            if (creep.withdraw(pickupTarget, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                moveToTarget(creep, pickupTarget, "#ffaa00");
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
}