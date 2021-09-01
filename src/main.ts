import { CreepManager, SpawnManager } from "managers";
import { ErrorMapper } from "utils/ErrorMapper";

declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: string;
    room: string;
    working: boolean;
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }
}
const spawnManager = new SpawnManager(Game);
const screepManager = new CreepManager(Memory, Game, spawnManager);

export const loop = ErrorMapper.wrapLoop(() => {
  // console.log(`Current game tick is ${Game.time}`);
  // Automatically delete memory of missing creeps
  screepManager.cleanup();

  for (let i in Game.rooms) {
    // getStrategy(room: Room) => {
    //   buildings: [STRUCTURE, STRUCTURE, STRUCTURE, STRUCTURE]
    //   builders: #,
    //   harvesters: #,
    //   upgrade: #
    // }: Strategy

    screepManager.maintain(Game.rooms[i], 2, 3, 2);
  }

  screepManager.work();
});
