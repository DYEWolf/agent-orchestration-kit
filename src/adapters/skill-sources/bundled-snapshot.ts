import type {
  SkillSnapshot,
  SkillSourceAdapter,
  StandardSkillName,
} from './skill-source.js';

export class BundledSnapshot implements SkillSourceAdapter {
  readonly #snapshots: ReadonlyMap<StandardSkillName, SkillSnapshot>;

  public constructor(snapshots: readonly SkillSnapshot[]) {
    this.#snapshots = new Map(snapshots.map((snapshot) => [snapshot.name, snapshot]));
  }

  public async list(): Promise<readonly StandardSkillName[]> {
    return [...this.#snapshots.keys()].sort();
  }

  public async load(name: StandardSkillName): Promise<SkillSnapshot> {
    const snapshot = this.#snapshots.get(name);
    if (snapshot === undefined) throw new Error(`Bundled skill snapshot is missing: ${name}`);
    return snapshot;
  }
}
