import path from 'node:path';
import type { FileSystemAdapter } from './filesystem.js';

export class InMemoryFileSystem implements FileSystemAdapter {
  readonly #files = new Map<string, string>();
  readonly #root: string;

  public constructor(root = path.resolve('/repository'), files: Readonly<Record<string, string>> = {}) {
    this.#root = path.resolve(root);
    for (const [filePath, content] of Object.entries(files)) {
      this.#files.set(this.resolve(filePath), content);
    }
  }

  public resolve(filePath: string): string {
    return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(this.#root, filePath);
  }

  public seed(filePath: string, content: string): void {
    this.#files.set(this.resolve(filePath), content);
  }

  public async exists(filePath: string): Promise<boolean> {
    return this.#files.has(this.resolve(filePath)) || this.resolve(filePath) === this.#root;
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
    if (resolved === this.#root) return 'directory';
    return undefined;
  }

  public async realpath(filePath: string): Promise<string> {
    return this.resolve(filePath);
  }

  public snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries([...this.#files.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}
