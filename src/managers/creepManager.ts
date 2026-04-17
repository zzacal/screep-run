import { SpawnManager } from "./spawnManager";
import { CreepRole } from "../types/creepRole";
import { affinityFromLegacyRole } from "types/affinity";
import { canonicalAffinityFor, computeCoverage, rankSpawnProfiles } from "needs/spawnNeeds";
import { buildBodyForTask, bodyCost } from "needs/bodyBuilder";
import { resolveCurrentTask } from "work/taskSelector";
import { RoomNeeds } from "types/roomNeeds";
import { TaskName } from "types/taskName";
import {
  build,
  defend,
  harvest,
  haul,
  remoteHaul,
  remoteHarvest,
  upgrade,
} from "work";

const TASK_DISPATCH: Record<TaskName, (creep: Creep) => void> = {
  harvest,
  haul,
  build,
  upgrade,
  defend,
  remoteHarvest,
  remoteHaul,
};

export class CreepManager {
  spawnings: Map<string, Spawning> = new Map();

  constructor(private spawnManager: SpawnManager) {}

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
        creep.memory.sourceId == null
      ) {
        continue;
      }
      const aff = creep.memory.affinity;
      if (!aff || aff.harvest < 0.5) {
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

  public createWithMemory = (
    room: Room,
    role: string,
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
      const result = spawn.spawnCreep(body, name, { memory });
      if (result === 0) {
        console.log("Spawning creep:", role, name);
        spawn.spawning &&
          this.spawnings.set(spawn.spawning.name, spawn.spawning);
      }
    }
  };

  public maintain = (room: Room, needs: RoomNeeds) => {
    const coverage = computeCoverage(room);
    const ranked = rankSpawnProfiles(needs, coverage);

    for (const { profile, dominantTask } of ranked) {
      // Size body for capacity; fall back to what's available right now
      let body = buildBodyForTask(dominantTask, room.energyCapacityAvailable);
      if (bodyCost(body) > room.energyAvailable) {
        body = buildBodyForTask(dominantTask, room.energyAvailable);
      }
      if (bodyCost(body) > room.energyAvailable) {
        continue; // can't afford this task's minimum body right now
      }

      const sourceId =
        dominantTask === "harvest"
          ? this.assignSourceForHarvester(room)
          : undefined;

      this.createWithMemory(room, dominantTask, body, {
        affinity: profile,
        currentTask: undefined,
        sourceId,
      });
      return;
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

      const dominant = creep.memory.currentTask ?? creep.memory.role;
      if (dominant === "remoteHarvest" || dominant === CreepRole.remoteHarvester) {
        rhCount++;
      } else if (dominant === "remoteHaul" || dominant === CreepRole.remoteHauler) {
        rcCount++;
      }
    }

    if (rhCount < remoteHarvesters) {
      this.createWithMemory(
        homeRoom,
        "remoteHarvest",
        buildBodyForTask("remoteHarvest", homeRoom.energyCapacityAvailable),
        {
          affinity: canonicalAffinityFor("remoteHarvest"),
          homeRoom: homeRoom.name,
          remoteRoom: remoteRoomName,
          sourceId: undefined,
        }
      );
    } else if (rcCount < remoteHaulers) {
      this.createWithMemory(
        homeRoom,
        "remoteHaul",
        buildBodyForTask("remoteHaul", homeRoom.energyCapacityAvailable),
        {
          affinity: canonicalAffinityFor("remoteHaul"),
          homeRoom: homeRoom.name,
          remoteRoom: remoteRoomName,
        }
      );
    }
  };

  public work = (needsByRoom: Map<string, RoomNeeds>) => {
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];

      // Synthesize affinity for legacy creeps spawned before this system
      if (!creep.memory.affinity) {
        creep.memory.affinity = affinityFromLegacyRole(creep.memory.role);
      }

      const roomName = creep.memory.homeRoom ?? creep.memory.room;
      const needs = needsByRoom.get(roomName) ?? needsByRoom.values().next().value;
      if (!needs) {
        continue;
      }

      const task = resolveCurrentTask(creep, needs);
      TASK_DISPATCH[task]?.(creep);
    }
  };

  public cleanup = () => {
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
      }
    }
  };
}
