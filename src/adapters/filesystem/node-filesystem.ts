import { access, lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import type { FileSystemAdapter } from './filesystem.js';

export class NodeFileSystem implements FileSystemAdapter {
  public async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  public readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  public async makeDirectory(path: string): Promise<void> {
    await mkdir(path);
  }

  public async entryKind(path: string): Promise<'file' | 'directory' | 'symlink' | 'other' | undefined> {
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) return 'symlink';
      if (stats.isFile()) return 'file';
      if (stats.isDirectory()) return 'directory';
      return 'other';
    } catch (error) {
      if (isMissingEntryError(error) || isNonDirectoryError(error)) return undefined;
      throw error;
    }
  }

  public realpath(path: string): Promise<string> {
    return realpath(path);
  }

  public async removeDirectory(path: string): Promise<void> {
    await rmdir(path);
  }

  public async removeFile(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  public rename(source: string, destination: string): Promise<void> {
    return rename(source, destination);
  }

  public writeFile(path: string, content: string): Promise<void> {
    return writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
  }
}

function isMissingEntryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isNonDirectoryError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOTDIR';
}
