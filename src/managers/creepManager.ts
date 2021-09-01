import { SpawnManager } from "./spawnManager";
import { CreepRole } from "../types/creepRole";
import { build, harvest, upgrade } from "work";

export class CreepManager {
  creeps: Map<string, Creep> = new Map();
  creepsByRole: Map<CreepRole, Array<Creep>> = new Map();
  spawnings: Map<string, Spawning> = new Map();

  constructor(
    private memory: Memory,
    private game: Game,
    private spawnManager: SpawnManager
  ) {}

  public create = (room: Room, role: CreepRole, body = [WORK, CARRY, MOVE]) => {
    const spawn = this.spawnManager.getSpawn(
      (spawn) => spawn.room.name === room.name
    );
    if (spawn) {
      const name = `${role}_${this.game.time}`;
      const result = spawn.spawnCreep(body, name, {
        memory: { role, room: room.name, working: false },
      });
      if (result === 0) {
        console.log("Spawning creep:", role, name);
        spawn.spawning &&
          this.spawnings.set(spawn.spawning.name, spawn.spawning);
      }
    }
  };

  public maintain = (room: Room,
    builders: number,
    harvesters: number,
    upgraders: number
  ) => {
    let bCount = 0, 
        hCount = 0,
        uCount = 0;
    for(let c in this.game.creeps) {
      switch (this.game.creeps[c].memory.role) {
        case CreepRole.builder:
          bCount++;
          break;
        case CreepRole.harverster:
          hCount++;
        case CreepRole.upgrader:
          uCount++
        default:
          break;
      }
    }

    if (hCount < harvesters) {
      this.create(room, CreepRole.harverster);
    } else if (uCount < upgraders) {
      this.create(room, CreepRole.upgrader);
    } else if (bCount < builders) {
      this.create(room, CreepRole.builder);
    }
  };

  public work = () => {
    for (var name in this.game.creeps) {
      var creep = this.game.creeps[name];
      if (creep.memory.role == CreepRole.harverster) {
        harvest(creep);
      }
      if (creep.memory.role == CreepRole.upgrader) {
        upgrade(creep);
      }
      if (creep.memory.role == CreepRole.builder) {
        build(creep);
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

  private Add(creep: Creep): void {
    this.creeps.set(creep.name, creep);

    const role = creep.memory.role as CreepRole;
    this.creepsByRole.set(role, [
      creep,
      ...(this.creepsByRole.get(role) ?? []),
    ]);
  }
}
