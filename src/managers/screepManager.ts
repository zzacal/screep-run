import { SpawnManager } from "./spawnManager";
import { ScreepRole } from "../types/ScreepRole";

export class ScreepManager {
  constructor(
    private memory: Memory,
    private game: Game,
    private spawnManager: SpawnManager
  ) {}

  public create = (
    room: Room,
    role: ScreepRole,
    body = [WORK, CARRY, MOVE]
  ) => {
    const spawns = this.spawnManager.getSpawn(
      (spawn) => spawn.room.name === room.name
    );
    if (spawns) {
      const name = `${role}_${this.game.time}`;
      const result = spawns.spawnCreep(body, name, {
        memory: { role, room: room.name, working: false },
      });
      if (result === 0) {
        console.log("Spawning creep:", role, name);
      }
    }
  };

  public cleanup = () => {
    for (const name in this.memory.creeps) {
      if (!(name in this.game.creeps)) {
        delete this.memory.creeps[name];
      }
    }
  };
}
