/** Public site URL (no trailing slash). Plain module — safe to import from jobs, scripts and route handlers. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Absolute URL for a stored file: local "/media/…" paths get the site origin, Blob URLs are already absolute. */
export const absoluteUrl = (u: string) => (/^https?:\/\//.test(u) ? u : `${SITE_URL}${u}`);
