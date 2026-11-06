// Migrates the separate TEST database before `npm test` (never the real data). URL: TEST_DATABASE_URL in .env
import { execSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("Set TEST_DATABASE_URL in .env (e.g. postgresql://USER@localhost:5432/royale_hotel_test)"); process.exit(1); }
execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });
