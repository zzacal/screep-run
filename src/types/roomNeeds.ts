import { TaskName } from "types/taskName";

export type RoomNeeds = Record<TaskName, number>;

export const makeRoomNeeds = (overrides: Partial<RoomNeeds>): RoomNeeds => ({
  harvest: 0,
  haul: 0,
  build: 0,
  upgrade: 0,
  defend: 0,
  remoteHarvest: 0,
  remoteHaul: 0,
  repair: 0,
  ...overrides,
});
