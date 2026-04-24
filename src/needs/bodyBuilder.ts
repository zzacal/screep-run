import { TaskName } from "types/taskName";

export const bodyCost = (body: BodyPartConstant[]): number =>
  body.reduce((sum, part) => sum + BODYPART_COST[part], 0);

export const buildBodyForTask = (task: TaskName, energyCapacity: number): BodyPartConstant[] => {
  switch (task) {
    case "harvest":       return buildHarvesterBody(energyCapacity);
    case "haul":          return buildHaulerBody(energyCapacity);
    case "build":
    case "upgrade":       return buildWorkerBody(energyCapacity);
    case "defend":        return buildDefenderBody(energyCapacity);
    case "repair":        return buildWorkerBody(energyCapacity);
    case "remoteHarvest": return buildRemoteHarvesterBody(energyCapacity);
    case "remoteHaul":    return buildRemoteHaulerBody(energyCapacity);
    default: {
      const _exhaustive: never = task;
      return [WORK, CARRY, MOVE];
    }
  }
};

const buildHarvesterBody = (cap: number): BodyPartConstant[] => {
  if (cap >= 550) return [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
  if (cap >= 400) return [WORK, WORK, CARRY, MOVE, MOVE];
  if (cap >= 300) return [WORK, WORK, CARRY, MOVE];
  return [WORK, CARRY, MOVE];
};

const buildHaulerBody = (cap: number): BodyPartConstant[] => {
  if (cap >= 750) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
  if (cap >= 600) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
  if (cap >= 450) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
  if (cap >= 300) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];
  if (cap >= 200) return [CARRY, CARRY, MOVE, MOVE];
  return [CARRY, MOVE];
};

const buildWorkerBody = (cap: number): BodyPartConstant[] => {
  // 12W 3C 8M = 1750 cost; full speed on roads (16 MOVE capacity vs 15 non-MOVE fatigue)
  if (cap >= 1800) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
  // 7W 2C 5M = 1050 cost; full speed on roads (10 vs 9)
  if (cap >= 1100) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
  // 5W 2C 4M = 800 cost; full speed on roads (8 vs 7)
  if (cap >= 850) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
  if (cap >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
  if (cap >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
  if (cap >= 350) return [WORK, WORK, CARRY, MOVE, MOVE];
  return [WORK, CARRY, MOVE];
};

const buildDefenderBody = (cap: number): BodyPartConstant[] => {
  if (cap >= 260) return [MOVE, MOVE, ATTACK, ATTACK];
  if (cap >= 130) return [MOVE, ATTACK];
  return [MOVE];
};

const buildRemoteHarvesterBody = (cap: number): BodyPartConstant[] => {
  if (cap >= 450) return [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
  if (cap >= 350) return [WORK, WORK, CARRY, MOVE, MOVE];
  return [WORK, CARRY, MOVE, MOVE];
};

const buildRemoteHaulerBody = (cap: number): BodyPartConstant[] => {
  if (cap >= 400) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
  if (cap >= 300) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
  return [CARRY, CARRY, MOVE, MOVE];
};
