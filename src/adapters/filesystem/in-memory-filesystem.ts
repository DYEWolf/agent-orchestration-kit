import path from 'node:path';
import type { FileSystemAdapter } from './filesystem.js';

export class InMemoryFileSystem implements FileSystemAdapter {
  readonly #files = new Map<string, string>();
  readonly #directories = new Set<string>();
  readonly #root: string;

  public constructor(root = path.resolve('/repository'), files: Readonly<Record<string, string>> = {}) {
    this.#root = path.resolve(root);
    this.#directories.add(this.#root);
    for (const [filePath, content] of Object.entries(files)) {
      const resolved = this.resolve(filePath);
      this.seedDirectories(path.dirname(resolved));
      this.#files.set(resolved, content);
    }
  }

  public resolve(filePath: string): string {
    return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(this.#root, filePath);
  }

  public seed(filePath: string, content: string): void {
    const resolved = this.resolve(filePath);
    this.seedDirectories(path.dirname(resolved));
    this.#files.set(resolved, content);
  }

  public async exists(filePath: string): Promise<boolean> {
    const resolved = this.resolve(filePath);
    return this.#files.has(resolved) || this.#directories.has(resolved);
  }

  public async readFile(filePath: string): Promise<string> {
    const resolved = this.resolve(filePath);
    const content = this.#files.get(resolved);
    if (content === undefined) {
      throw new Error(`ENOENT: ${resolved}`);
    }
    return content;
  }

  public async entryKind(filePath: string): Promise<'file' | 'directory' | undefined> {
    const resolved = this.resolve(filePath);
    if (this.#files.has(resolved)) return 'file';
    if (this.#directories.has(resolved)) return 'directory';
    return undefined;
  }

  public async makeDirectory(filePath: string): Promise<void> {
    const resolved = this.resolve(filePath);
    if (this.#files.has(resolved) || this.#directories.has(resolved)) throw new Error(`EEXIST: ${resolved}`);
    if (!this.#directories.has(path.dirname(resolved))) throw new Error(`ENOENT: ${resolved}`);
    this.#directories.add(resolved);
  }

  public async realpath(filePath: string): Promise<string> {
    const resolved = this.resolve(filePath);
    if (!(await this.exists(resolved))) throw new Error(`ENOENT: ${resolved}`);
    return resolved;
  }

  public async removeDirectory(filePath: string): Promise<void> {
    const resolved = this.resolve(filePath);
    const hasChildren = [...this.#files.keys(), ...this.#directories].some(
      (candidate) => candidate !== resolved && path.dirname(candidate) === resolved,
    );
    if (hasChildren) throw new Error(`ENOTEMPTY: ${resolved}`);
    this.#directories.delete(resolved);
  }

  public async removeFile(filePath: string): Promise<void> {
    this.#files.delete(this.resolve(filePath));
  }

  public async rename(source: string, destination: string): Promise<void> {
    const resolvedSource = this.resolve(source);
    const resolvedDestination = this.resolve(destination);
    const content = this.#files.get(resolvedSource);
    if (content === undefined) throw new Error(`ENOENT: ${resolvedSource}`);
    if (this.#files.has(resolvedDestination) || this.#directories.has(resolvedDestination)) {
      throw new Error(`EEXIST: ${resolvedDestination}`);
    }
    this.#files.set(resolvedDestination, content);
    this.#files.delete(resolvedSource);
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.resolve(filePath);
    if (this.#files.has(resolved) || this.#directories.has(resolved)) throw new Error(`EEXIST: ${resolved}`);
    if (!this.#directories.has(path.dirname(resolved))) throw new Error(`ENOENT: ${resolved}`);
    this.#files.set(resolved, content);
  }

  public snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries([...this.#files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }

  private seedDirectories(directory: string): void {
    let current = directory;
    const pending: string[] = [];
    while (!this.#directories.has(current) && current !== path.dirname(current)) {
      pending.push(current);
      current = path.dirname(current);
    }
    for (const candidate of pending.reverse()) this.#directories.add(candidate);
  }
}
