export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>;
  entryKind(path: string): Promise<'file' | 'directory' | 'symlink' | 'other' | undefined>;
  readFile(path: string): Promise<string>;
  realpath(path: string): Promise<string>;
}
