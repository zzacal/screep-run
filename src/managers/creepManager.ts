import { SpawnManager } from "./spawnManager";
import { CreepRole } from "../types/creepRole";
import {
  build,
  defend,
  harvest,
  haul,
  remoteHaul,
  remoteHarvest,
  upgrade,
} from "work";

export class CreepManager {
  creeps: Map<string, Creep> = new Map();
  creepsByRole: Map<CreepRole, Array<Creep>> = new Map();
  spawnings: Map<string, Spawning> = new Map();

  constructor(private spawnManager: SpawnManager) {}

  private getDefenderBody = (room: Room): BodyPartConstant[] => {
    if (room.energyCapacityAvailable >= 260) {
      return [MOVE, MOVE, ATTACK, ATTACK];
    }

    if (room.energyCapacityAvailable >= 130) {
      return [MOVE, ATTACK];
    }

    return [MOVE];
  };

  private getHaulerBody = (room: Room): BodyPartConstant[] => {
    if (room.energyCapacityAvailable >= 300) {
      return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];
    }

    if (room.energyCapacityAvailable >= 200) {
      return [CARRY, CARRY, MOVE, MOVE];
    }

    return [CARRY, MOVE];
  };

  private getRemoteHarvesterBody = (room: Room): BodyPartConstant[] => {
    if (room.energyCapacityAvailable >= 450) {
      return [WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];
    }

    if (room.energyCapacityAvailable >= 350) {
      return [WORK, WORK, CARRY, MOVE, MOVE];
    }

    return [WORK, CARRY, MOVE, MOVE];
  };

  private getRemoteHaulerBody = (room: Room): BodyPartConstant[] => {
    if (room.energyCapacityAvailable >= 400) {
      return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    }

    if (room.energyCapacityAvailable >= 300) {
      return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    }

    return [CARRY, CARRY, MOVE, MOVE];
  };

  private getBuilderBody = (room: Room): BodyPartConstant[] => {
    if (room.energyCapacityAvailable >= 550) {
      return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
    }

    if (room.energyCapacityAvailable >= 400) {
      return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    }

    if (room.energyCapacityAvailable >= 300) {
      return [WORK, WORK, CARRY, MOVE, MOVE];
    }

    return [WORK, CARRY, MOVE];
  };

  private assignSourceForHarvester = (room: Room): Id<Source> | undefined => {
    const sources = room.find(FIND_SOURCES);
    if (sources.length === 0) {
      return undefined;
    }

    const assignedCounts = new Map<Id<Source>, number>();
    for (const source of sources) {
      assignedCounts.set(source.id, 0);
    }

    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      if (
        creep.memory.room !== room.name ||
        creep.memory.role !== CreepRole.harverster ||
        creep.memory.sourceId == null
      ) {
        continue;
      }

      const current = assignedCounts.get(creep.memory.sourceId) ?? 0;
      assignedCounts.set(creep.memory.sourceId, current + 1);
    }

    let bestSource = sources[0];
    let bestCount = assignedCounts.get(bestSource.id) ?? 0;
    for (const source of sources) {
      const count = assignedCounts.get(source.id) ?? 0;
      if (count < bestCount) {
        bestSource = source;
        bestCount = count;
      }
    }

    return bestSource.id;
  };

  public create = (
    room: Room,
    role: CreepRole,
    body: BodyPartConstant[] = [WORK, CARRY, MOVE]
  ) => {
    const sourceId =
      role === CreepRole.harverster
        ? this.assignSourceForHarvester(room)
        : undefined;

    this.createWithMemory(room, role, body, { sourceId });
  };

  public createWithMemory = (
    room: Room,
    role: CreepRole,
    body: BodyPartConstant[],
    memoryOverrides: Partial<CreepMemory>
  ) => {
    const spawn = this.spawnManager.getSpawn(
      (spawn) => spawn.room.name === room.name
    );
    if (spawn) {
      const name = `${role}_${Game.time}`;
      const memory: CreepMemory = {
        role,
        room: room.name,
        working: false,
        ...memoryOverrides,
      };
      const result = spawn.spawnCreep(body, name, {
        memory,
      });
      if (result === 0) {
        console.log("Spawning creep:", role, name);
        spawn.spawning &&
          this.spawnings.set(spawn.spawning.name, spawn.spawning);
      }
    }
  };

  public maintainRemote = (
    homeRoom: Room,
    remoteRoomName: string,
    remoteHarvesters: number,
    remoteHaulers: number,
    enabled: boolean
  ) => {
    if (!enabled) {
      return;
    }

    let rhCount = 0,
      rcCount = 0;

    for (const c in Game.creeps) {
      const creep = Game.creeps[c];
      if (
        creep.memory.homeRoom !== homeRoom.name ||
        creep.memory.remoteRoom !== remoteRoomName
      ) {
        continue;
      }

      switch (creep.memory.role) {
        case CreepRole.remoteHarvester:
          rhCount++;
          break;
        case CreepRole.remoteHauler:
          rcCount++;
          break;
        default:
          break;
      }
    }

    if (rhCount < remoteHarvesters) {
      this.createWithMemory(
        homeRoom,
        CreepRole.remoteHarvester,
        this.getRemoteHarvesterBody(homeRoom),
        {
          homeRoom: homeRoom.name,
          remoteRoom: remoteRoomName,
          sourceId: undefined,
        }
      );
    } else if (rcCount < remoteHaulers) {
      this.createWithMemory(
        homeRoom,
        CreepRole.remoteHauler,
        this.getRemoteHaulerBody(homeRoom),
        {
          homeRoom: homeRoom.name,
          remoteRoom: remoteRoomName,
        }
      );
    }
  };

  public maintain = (
    room: Room,
    builders: number,
    harvesters: number,
    upgraders: number,
    defenders: number = 0,
    haulers: number = 0
  ) => {
    let bCount = 0,
      hCount = 0,
      uCount = 0,
      dCount = 0,
      cCount = 0;
    for (const c in Game.creeps) {
      const creep = Game.creeps[c];
      if (creep.memory.room !== room.name) {
        continue;
      }

      switch (creep.memory.role) {
        case CreepRole.builder:
          bCount++;
          break;
        case CreepRole.harverster:
          hCount++;
          break;
        case CreepRole.upgrader:
          uCount++;
          break;
        case CreepRole.defender:
          dCount++;
          break;
        case CreepRole.hauler:
          cCount++;
          break;
        default:
          break;
      }
    }

    if (dCount < defenders) {
      this.create(room, CreepRole.defender, this.getDefenderBody(room));
    } else if (cCount < haulers) {
      this.create(room, CreepRole.hauler, this.getHaulerBody(room));
    } else if (hCount < harvesters) {
      this.create(room, CreepRole.harverster);
    } else if (uCount < upgraders) {
      this.create(room, CreepRole.upgrader);
    } else if (bCount < builders) {
      this.create(room, CreepRole.builder, this.getBuilderBody(room));
    }
  };

  public work = () => {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      if (creep.memory.role == CreepRole.harverster) {
        harvest(creep);
      }
      if (creep.memory.role == CreepRole.upgrader) {
        upgrade(creep);
      }
      if (creep.memory.role == CreepRole.builder) {
        build(creep);
      }
      if (creep.memory.role == CreepRole.defender) {
        defend(creep);
      }
      if (creep.memory.role == CreepRole.hauler) {
        haul(creep);
      }
      if (creep.memory.role == CreepRole.remoteHarvester) {
        remoteHarvest(creep);
      }
      if (creep.memory.role == CreepRole.remoteHauler) {
        remoteHaul(creep);
      }
    }
  };

  public cleanup = () => {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
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
