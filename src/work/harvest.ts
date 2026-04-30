import { findAssignedSource, findReachableSource, moveToTarget } from "work/utils";

// When the container already holds energy above the haul pickup floor, route
// surplus harvest directly into the source link so runLinks can forward it
// to the controller-side link — avoids upgraders walking to sources.
// Must stay at or below MIN_SOURCE_CONTAINER_PICKUP (100) in haul.ts so
// containers don't oscillate below the threshold and starve the link chain.
const SOURCE_CONTAINER_BUFFER = 100;

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

    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
        return;
    }

    const sourceContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTAINER,
    })[0] as StructureContainer | undefined;

    const sourceLink = source.pos.findInRange(FIND_MY_STRUCTURES, 1, {
        filter: (s): s is StructureLink =>
            s.structureType === STRUCTURE_LINK &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0,
    })[0] as StructureLink | undefined;

    // Container has a hauler-load buffered — route surplus to the source link.
    // If not yet adjacent to the link, reposition rather than filling the container:
    // the container already has a hauler-load buffered, and link energy propagates
    // to the controller link (via runLinks) freeing haulers to fill storage.
    const containerBuffered =
        sourceContainer != null &&
        sourceContainer.store.getUsedCapacity(RESOURCE_ENERGY) >= SOURCE_CONTAINER_BUFFER;
    if (sourceLink && containerBuffered) {
        if (creep.pos.isNearTo(sourceLink)) {
            creep.transfer(sourceLink, RESOURCE_ENERGY);
        } else {
            moveToTarget(creep, sourceLink, "#00aaff");
        }
        return;
    }

    if (sourceContainer && creep.pos.isNearTo(sourceContainer)) {
        const xferResult = creep.transfer(sourceContainer, RESOURCE_ENERGY);
        if (xferResult !== ERR_FULL) {
            return;
        }
        // container full — fall through to try the link
    }

    if (sourceLink && creep.pos.isNearTo(sourceLink)) {
        creep.transfer(sourceLink, RESOURCE_ENERGY);
        return;
    }

    if (creep.store.getFreeCapacity() === 0) {
        creep.drop(RESOURCE_ENERGY);
    }
}
