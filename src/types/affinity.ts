import { TaskName } from "types/taskName";

export type Affinity = Record<TaskName, number>;

export const makeAffinity = (overrides: Partial<Affinity>): Affinity => ({
  harvest: 0,
  haul: 0,
  build: 0,
  upgrade: 0,
  defend: 0,
  remoteHarvest: 0,
  remoteHaul: 0,
  repair: 0,
  mineralHarvest: 0,
  ...overrides,
});

export const affinityFromLegacyRole = (role: string): Affinity => {
  switch (role) {
    case "h":  return makeAffinity({ harvest: 1.0 });
    case "c":  return makeAffinity({ haul: 1.0 });
    case "b":  return makeAffinity({ build: 0.8, upgrade: 0.3 });
    case "u":  return makeAffinity({ upgrade: 1.0 });
    case "d":  return makeAffinity({ defend: 1.0 });
    case "rh": return makeAffinity({ remoteHarvest: 1.0 });
    case "rc": return makeAffinity({ remoteHaul: 1.0 });
    default:   return makeAffinity({ upgrade: 0.5, haul: 0.5 });
  }
};
