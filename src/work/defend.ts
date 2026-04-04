import { moveToTarget } from "work/utils";

export const defend = (creep: Creep) => {
  const hostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
  if (!hostile) {
    return;
  }

  if (creep.attack(hostile) == ERR_NOT_IN_RANGE) {
    moveToTarget(creep, hostile, "#ff5555");
  }
};
