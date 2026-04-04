import { findAssignedSource, findReachableSource, moveToTarget } from "work/utils";

export const harvest = (creep: Creep) => {
    const source = findAssignedSource(creep) ?? findReachableSource(creep);
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

    if (creep.store.getFreeCapacity() === 0) {
        creep.drop(RESOURCE_ENERGY);
    }
}