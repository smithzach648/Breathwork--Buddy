/** Native Node fixtures preserve Blob data under fake-indexeddb's structuredClone. */
declare module 'node:buffer' {
    export const Blob: typeof globalThis.Blob;
    export const File: typeof globalThis.File;
}
