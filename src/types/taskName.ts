export type TaskName =
  | "harvest"
  | "haul"
  | "build"
  | "upgrade"
  | "defend"
  | "remoteHarvest"
  | "remoteHaul"
  | "repair";

export const ALL_TASKS: readonly TaskName[] = [
  "harvest",
  "haul",
  "build",
  "upgrade",
  "defend",
  "remoteHarvest",
  "remoteHaul",
  "repair",
] as const;
