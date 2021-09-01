export class SpawnManager {
  constructor(private game: Game) {

  }

  public getSpawns = (): Array<StructureSpawn> => {
    let results = [];
    for (const i in this.game.spawns) {
      results.push(this.game.spawns[i]);
    }
    return results;
  }

  public getSpawn = (filter: (spawns: StructureSpawn) => boolean): StructureSpawn | null => {
    for(const i in this.game.spawns) {
      const current = this.game.spawns[i];
      if(filter(current)) {
        return current;
      }
    }
    return null;
  }
}