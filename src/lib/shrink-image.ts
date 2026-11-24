/**
 * Browser-side: make a photo small enough to upload. The hosting platform refuses requests over about
 * 4.5 MB, and phone photos are often 5–12 MB. The server keeps at most 2560 px on the long edge anyway
 * (MAX_EDGE in lib/media/process.ts), so the first step loses nothing that would have been kept.
 */
export const UPLOAD_LIMIT = 4_000_000;
const STEPS = [{ edge: 2560, quality: 0.9 }, { edge: 2560, quality: 0.8 }, { edge: 2048, quality: 0.8 }, { edge: 1600, quality: 0.75 }];

export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Returns the file itself when it is small enough or the browser cannot read it (the server then reports the size). */
export async function shrinkForUpload(file: File, limit = UPLOAD_LIMIT): Promise<File> {
  if (file.size <= limit) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      for (const step of STEPS) {
        const { width, height } = fitWithin(bitmap.width, bitmap.height, step.edge);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality));
        if (blob && blob.size <= limit) return new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified });
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // e.g. HEIC in a browser that cannot decode it
  }
  return file;
}
