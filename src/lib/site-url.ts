/** Public site URL (no trailing slash). Plain module — safe to import from jobs, scripts and route handlers. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
