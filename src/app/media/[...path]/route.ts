import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { LOCAL_MEDIA_ROOT } from "@/lib/media/storage";

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

/** Serves locally stored media (storage driver "local"). File names are content-hashed → immutable. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const file = normalize(join(LOCAL_MEDIA_ROOT, ...path));
  const type = TYPES[extname(file).toLowerCase()];
  if (!file.startsWith(LOCAL_MEDIA_ROOT + "/") || !type) return new Response("Not found", { status: 404 });
  try {
    const info = await stat(file);
    const body = await readFile(file);
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
