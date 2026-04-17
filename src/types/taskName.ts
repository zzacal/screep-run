export type TaskName =
  | "harvest"
  | "haul"
  | "build"
  | "upgrade"
  | "defend"
  | "remoteHarvest"
  | "remoteHaul";

export const ALL_TASKS: readonly TaskName[] = [
  "harvest",
  "haul",
  "build",
  "upgrade",
  "defend",
  "remoteHarvest",
  "remoteHaul",
] as const;
