export const findReachableSource = (creep: Creep): Source | null => {
  const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
  if (source) {
    return source;
  }

  // Fallback for rooms where no active source has a complete path result this tick.
  return creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
};

export const findAssignedSource = (creep: Creep): Source | null => {
  if (creep.memory.sourceId) {
    const assigned = Game.getObjectById(creep.memory.sourceId);
    if (assigned) {
      return assigned;
    }
    delete creep.memory.sourceId;
  }

  const source = creep.pos.findClosestByPath(FIND_SOURCES);
  if (source) {
    creep.memory.sourceId = source.id;
    return source;
  }

  return creep.pos.findClosestByRange(FIND_SOURCES);
};

export const moveToTarget = (
  creep: Creep,
  target: RoomPosition | { pos: RoomPosition },
  stroke: string
) => {
  creep.moveTo(target, {
    visualizePathStyle: { stroke },
    reusePath: 8,
    maxRooms: 1,
  });
};
