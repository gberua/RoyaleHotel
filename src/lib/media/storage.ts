/**
 * Storage driver for media files.
 * • local (default): files in ./storage/media, served by src/app/media/[...path]/route.ts
 *   — right for a VPS / Docker deployment.
 * • s3: any S3-compatible bucket (Cloudflare R2, AWS S3) — required on Vercel, whose
 *   filesystem is read-only. Implemented in phase (c) together with admin uploads.
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

export const LOCAL_MEDIA_ROOT = join(process.cwd(), "storage", "media");

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<string>; // returns public URL
  remove(key: string): Promise<void>;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const path = normalize(join(LOCAL_MEDIA_ROOT, key));
    if (!path.startsWith(LOCAL_MEDIA_ROOT)) throw new Error("Invalid media key");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return `/media/${key}`;
  },
  async remove(key) {
    const path = normalize(join(LOCAL_MEDIA_ROOT, key));
    if (!path.startsWith(LOCAL_MEDIA_ROOT)) return;
    await unlink(path).catch(() => undefined);
  },
};

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return localDriver;
  throw new Error(`Storage driver "${driver}" is not configured yet (phase c adds s3).`);
}
