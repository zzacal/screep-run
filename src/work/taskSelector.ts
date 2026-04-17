import { RoomNeeds } from "types/roomNeeds";
import { TaskName, ALL_TASKS } from "types/taskName";

export const selectTask = (creep: Creep, needs: RoomNeeds): TaskName => {
  const affinity = creep.memory.affinity;
  if (!affinity) {
    return "upgrade";
  }

  let bestTask: TaskName = "upgrade";
  let bestScore = -Infinity;

  const hasWork = creep.body.some(p => p.type === WORK && p.hits > 0);
  const hasAttack = creep.body.some(p => p.type === ATTACK && p.hits > 0);

  for (const task of ALL_TASKS) {
    if (
      (task === "remoteHarvest" || task === "remoteHaul") &&
      !creep.memory.remoteRoom
    ) {
      continue;
    }

    if (task === "build" && creep.room.find(FIND_CONSTRUCTION_SITES).length === 0) {
      continue;
    }

    if ((task === "harvest" || task === "build" || task === "upgrade" || task === "remoteHarvest" || task === "repair") && !hasWork) {
      continue;
    }

    if (task === "defend" && !hasAttack) {
      continue;
    }

    const score = needs[task] * affinity[task];
    const winsOnScore = score > bestScore;
    const tiesButMoreNatural = score === bestScore && affinity[task] > affinity[bestTask];
    if (winsOnScore || tiesButMoreNatural) {
      bestScore = score;
      bestTask = task;
    }
  }

  return bestTask;
};

export const resolveCurrentTask = (creep: Creep, needs: RoomNeeds): TaskName => {
  const cycleEnded =
    !creep.memory.working && creep.store.getUsedCapacity() === 0;

  if (cycleEnded || !creep.memory.currentTask) {
    const task = selectTask(creep, needs);
    creep.memory.currentTask = task;
    return task;
  }

  return creep.memory.currentTask;
};
