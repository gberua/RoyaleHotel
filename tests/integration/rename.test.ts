/**
 * The second rename migration: texts the first one skipped (offers, FAQ, policies, e-mail templates,
 * Georgian case forms). Runs the real migration file against the test database.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";

const run = async () => db.$executeRawUnsafe(await readFile(join(process.cwd(), "prisma/migrations/20261124120000_rename_leftovers/migration.sql"), "utf8"));

beforeEach(() => db.$executeRawUnsafe(`TRUNCATE "Offer","FaqItem","Policy","EmailTemplate","Review" CASCADE`));
afterAll(() => db.$disconnect());

it("renames the old hotel name in offers, FAQ, policies and e-mail templates, in every Georgian case form", async () => {
  await db.offer.create({ data: { slug: "early-summer", title: { en: "Early summer at Royale Hotel", ka: "ადრეული ზაფხული როიალ ჰოტელში" }, summary: { ru: "Royale Hotel расположен у моря" } } });
  await db.faqItem.create({ data: { question: { ka: "სად არის როიალ ჰოტელი?" }, answer: { en: "Write to info@royalehotel.ge", ka: "როიალ ჰოტელის მისამართი" } } });
  await db.policy.create({ data: { slug: "privacy", title: { en: "Privacy" }, body: { en: "Royale Palace respects your privacy." } } });
  await db.emailTemplate.create({ data: { key: "pre_arrival", locale: "en", subject: "Your stay at Royale Hotel", body: "See you soon at Royale Hotel — booking@royalehotel.ge" } });
  await db.review.create({ data: { authorName: "Guest", rating: 5, body: "We loved Royale Hotel", source: "DIRECT", status: "APPROVED" } });

  await run();
  await run(); // safe to run twice

  const offer = await db.offer.findFirstOrThrow();
  expect(offer.slug).toBe("early-summer");
  expect(offer.title).toEqual({ en: "Early summer at Royal Palace", ka: "ადრეული ზაფხული როიალ პალასში" });
  expect(offer.summary).toEqual({ ru: "Royal Palace расположен у моря" });
  const faq = await db.faqItem.findFirstOrThrow();
  expect(faq.question).toEqual({ ka: "სად არის როიალ პალასი?" });
  expect(faq.answer).toEqual({ en: "Write to info@royalpalacehotel.ge", ka: "როიალ პალასის მისამართი" });
  expect((await db.policy.findFirstOrThrow()).body).toEqual({ en: "Royal Palace respects your privacy." });
  expect(await db.emailTemplate.findFirstOrThrow()).toMatchObject({ key: "pre_arrival", subject: "Your stay at Royal Palace", body: "See you soon at Royal Palace — booking@royalpalacehotel.ge" });
  expect((await db.review.findFirstOrThrow()).body).toBe("We loved Royale Hotel"); // a guest's own words are not rewritten
});
