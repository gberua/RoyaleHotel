/**
 * Storage driver for media files.
 * • local (default): files in ./storage/media, served by src/app/media/[...path]/route.ts
 *   — right for a VPS / Docker deployment.
 * • blob: Vercel Blob (STORAGE_DRIVER=blob + BLOB_READ_WRITE_TOKEN) — required on Vercel, whose filesystem is
 *   read-only. Files get public https://….public.blob.vercel-storage.com URLs.
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export const LOCAL_MEDIA_ROOT = join(process.cwd(), "storage", "media");

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>; // returns public URL
  /** Deletes a file by the public URL that `put` returned (unknown URLs are ignored). */
  removeUrl(url: string): Promise<void>;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const path = normalize(join(LOCAL_MEDIA_ROOT, key));
    if (!path.startsWith(LOCAL_MEDIA_ROOT)) throw new Error("Invalid media key");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return `/media/${key}`;
  },
  async removeUrl(url) {
    if (!url.startsWith("/media/")) return;
    const path = normalize(join(LOCAL_MEDIA_ROOT, url.slice("/media/".length)));
    if (!path.startsWith(LOCAL_MEDIA_ROOT)) return;
    await unlink(path).catch(() => undefined);
  },
};

const blobDriver: StorageDriver = {
  async put(key, data, contentType) {
    const { put } = await import("@vercel/blob");
    // the key already contains a content hash, so overwriting the same key means the same image
    const res = await put(`media/${key}`, data, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 * 60 * 24 * 365 });
    return res.url;
  },
  async removeUrl(url) {
    if (!/^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(url)) return;
    const { del } = await import("@vercel/blob");
    await del(url).catch(() => undefined);
  },
};

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return localDriver;
  if (driver === "blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("STORAGE_DRIVER=blob needs BLOB_READ_WRITE_TOKEN");
    return blobDriver;
  }
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local" or "blob")`);
}
