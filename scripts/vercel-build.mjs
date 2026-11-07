/**
 * Vercel build command (see vercel.json).
 * 1. applies database migrations (direct, un-pooled Neon connection)
 * 2. ONLY when SETUP_DATA=1 (first deploy): starting content + owner account, DEMO photos → Vercel Blob,
 *    and online payments switched off until a real provider is configured. Remove SETUP_DATA afterwards.
 * 3. next build
 */
import { execSync } from "node:child_process";

const run = (cmd, extraEnv = {}) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
};
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!direct) throw new Error("DATABASE_URL is not set — connect the Neon database to the project");

run("npx prisma migrate deploy", { DATABASE_URL: direct });

if (process.env.SETUP_DATA === "1") {
  const pw = process.env.SEED_OWNER_PASSWORD ?? "";
  if (!process.env.SEED_OWNER_EMAIL || pw.length < 10 || pw === "change-me-now") {
    throw new Error("SETUP_DATA=1 needs SEED_OWNER_EMAIL and a strong SEED_OWNER_PASSWORD (10+ characters) in the Vercel environment variables");
  }
  run("npx prisma db seed", { DATABASE_URL: direct });
  run("npx tsx scripts/demo-hero.ts", { DATABASE_URL: direct });
  run("npx tsx scripts/demo-photos.ts", { DATABASE_URL: direct });
  run("npx tsx scripts/live-defaults.ts", { DATABASE_URL: direct });
}

run("npm run build");
