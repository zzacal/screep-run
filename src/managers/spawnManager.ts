export class SpawnManager {
  constructor() {}

  public getSpawns = (): Array<StructureSpawn> => {
    const results = [];
    for (const i in Game.spawns) {
      results.push(Game.spawns[i]);
    }
    return results;
  }

  public getSpawn = (filter: (spawns: StructureSpawn) => boolean): StructureSpawn | null => {
    for (const i in Game.spawns) {
      const current = Game.spawns[i];
      if (filter(current)) {
        return current;
      }
    }
    return null;
  }
}