export type TaskName =
  | "harvest"
  | "haul"
  | "build"
  | "upgrade"
  | "defend"
  | "remoteHarvest"
  | "remoteHaul"
  | "repair"
  | "mineralHarvest";

export const ALL_TASKS: readonly TaskName[] = [
  "harvest",
  "haul",
  "build",
  "upgrade",
  "defend",
  "remoteHarvest",
  "remoteHaul",
  "repair",
  "mineralHarvest",
] as const;
