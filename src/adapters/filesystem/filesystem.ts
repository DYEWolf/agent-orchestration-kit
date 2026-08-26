export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>;
  entryKind(path: string): Promise<'file' | 'directory' | 'symlink' | 'other' | undefined>;
  makeDirectory(path: string): Promise<void>;
  readFile(path: string): Promise<string>;
  realpath(path: string): Promise<string>;
  removeDirectory(path: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  rename(source: string, destination: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
}
