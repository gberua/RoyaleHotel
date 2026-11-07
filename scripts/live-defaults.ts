/**
 * Safe defaults for a live site without a payment provider yet: guests can only choose "pay at the hotel".
 * Switch online payments on in Admin → Settings → Payment options once TBC / Bank of Georgia keys are set.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const row = await db.setting.findUnique({ where: { key: "booking" } });
  const value = { ...((row?.value as object) ?? {}), allowPayAtHotel: true, allowDeposit: false, allowFullPrepay: false };
  await db.setting.upsert({ where: { key: "booking" }, create: { key: "booking", value }, update: { value } });
  console.log("live defaults: pay at the hotel only (online payments off until a provider is configured)");
}
main().finally(() => db.$disconnect());
