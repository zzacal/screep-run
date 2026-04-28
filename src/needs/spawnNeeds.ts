import { Affinity, makeAffinity } from "types/affinity";
import { RoomNeeds } from "types/roomNeeds";
import { TaskName, ALL_TASKS } from "types/taskName";

const TARGET_COVERAGE = 3.0;

export const computeCoverage = (room: Room): Affinity => {
  const coverage = makeAffinity({});
  for (const name in Game.creeps) {
    const creep = Game.creeps[name];
    if (
      creep.memory.room !== room.name &&
      creep.memory.homeRoom !== room.name
    ) {
      continue;
    }
    const aff = creep.memory.affinity;
    if (!aff) continue;
    for (const task of ALL_TASKS) {
      coverage[task] += aff[task];
    }
  }
  return coverage;
};

export const canonicalAffinityFor = (task: TaskName): Affinity => {
  switch (task) {
    case "harvest":       return makeAffinity({ harvest: 1.0, haul: 0.1 });
    case "haul":          return makeAffinity({ haul: 1.0, build: 0.1 });
    case "build":         return makeAffinity({ build: 0.8, upgrade: 0.3, haul: 0.2, repair: 0.3 });
    case "upgrade":       return makeAffinity({ upgrade: 1.0, build: 0.2 });
    case "defend":        return makeAffinity({ defend: 1.0 });
    case "remoteHarvest": return makeAffinity({ remoteHarvest: 1.0 });
    case "remoteHaul":    return makeAffinity({ remoteHaul: 1.0 });
    case "repair":          return makeAffinity({ repair: 1.0, build: 0.3, upgrade: 0.1 });
    case "mineralHarvest":  return makeAffinity({ mineralHarvest: 1.0 });
    default: {
      const _exhaustive: never = task;
      return makeAffinity({});
    }
  }
};

export const rankSpawnProfiles = (
  needs: RoomNeeds,
  coverage: Affinity
): Array<{ profile: Affinity; dominantTask: TaskName }> => {
  return ALL_TASKS
    .map(task => ({ task, gap: needs[task] - coverage[task] / TARGET_COVERAGE }))
    .filter(({ task, gap }) => gap > 0 && task !== "remoteHarvest" && task !== "remoteHaul")
    .sort((a, b) => b.gap - a.gap)
    .map(({ task }) => ({ dominantTask: task, profile: canonicalAffinityFor(task) }));
};
