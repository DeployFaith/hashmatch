/**
 * Augment the File System Access API types with the async iterable methods
 * that are available in browsers but missing from TypeScript's DOM lib.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryHandle
 */
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}
