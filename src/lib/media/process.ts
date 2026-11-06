/**
 * Image pipeline shared by `npm run images` and admin uploads.
 * Original → auto-rotate → strip metadata (incl. GPS) → max 2560px →
 * WebP master + AVIF master + tiny blur placeholder + dominant colour.
 * Responsive sizes are produced on demand by next/image (AVIF/WebP) and cached.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { getStorage } from "./storage";

export const MAX_EDGE = 2560;

export type ProcessedImage = {
  url: string;
  avifUrl: string;
  width: number;
  height: number;
  blurDataUrl: string;
  dominantColor: string;
  checksum: string;
};

export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
}

export async function processImage(input: Buffer, baseName: string, folder = "photos"): Promise<ProcessedImage> {
  const checksum = createHash("sha256").update(input).digest("hex");
  const short = checksum.slice(0, 8);
  const slug = slugify(baseName);

  const pipeline = sharp(input, { failOn: "none" }).rotate().resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  const { data: webp, info } = await pipeline.clone().webp({ quality: 80, effort: 5 }).toBuffer({ resolveWithObject: true });
  const avif = await pipeline.clone().avif({ quality: 52, effort: 4 }).toBuffer();
  const blur = await pipeline.clone().resize(24, 24, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  const stats = await sharp(input).stats();
  const d = stats.dominant;
  const dominantColor = `#${[d.r, d.g, d.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

  const storage = getStorage();
  const key = `${folder}/${slug}-${short}`;
  const url = await storage.put(`${key}.webp`, webp, "image/webp");
  const avifUrl = await storage.put(`${key}.avif`, avif, "image/avif");

  return {
    url,
    avifUrl,
    width: info.width,
    height: info.height,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    dominantColor,
    checksum,
  };
}
