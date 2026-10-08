/**
 * Minimal ambient types for the bits of `multer` the media endpoint uses.
 *
 * `multer` (v2) ships no bundled TypeScript declarations and `@types/multer`
 * is not installed in this workspace, so `FileInterceptor`'s `MulterOptions`
 * slot types `storage` as `any` and none of the file shapes are in scope.
 * These three declarations are the smallest honest surface for what this code
 * actually calls. Delete this file and import from the upstream package once
 * `@types/multer` is added.
 */
declare module 'multer' {
  /** A file after Multer has written it to disk. */
  export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
  }

  export interface DiskStorageOptions {
    destination?:
      | string
      | ((
          req: unknown,
          file: File,
          callback: (error: Error | null, destination: string) => void,
        ) => void);
    filename?: (
      req: unknown,
      file: File,
      callback: (error: Error | null, filename: string) => void,
    ) => void;
  }

  export function diskStorage(options: DiskStorageOptions): unknown;
}