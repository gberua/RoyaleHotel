-- The hotel is "Royal Palace" (no "e"), on royalpalacehotel.ge. Rename the stored texts that still
-- say "Royale Hotel" / "Royale Suite" / royalehotel.ge. Safe to run more than once.

-- Settings: hotel name, contact e-mail addresses
UPDATE "Setting"
SET "value" = replace(replace(replace(replace("value"::text,
      'Royale Hotel', 'Royal Palace'), 'Royale Palace', 'Royal Palace'), 'როიალ ჰოტელი', 'როიალ პალასი'), 'royalehotel.ge', 'royalpalacehotel.ge')::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "value"::text ~ 'Royale (Hotel|Palace)|როიალ ჰოტელი|royalehotel\.ge';

-- Page texts (published and draft) and their SEO fields
UPDATE "Page"
SET "sections" = replace(replace(replace("sections"::text, 'Royale Hotel', 'Royal Palace'), 'Royale Palace', 'Royal Palace'), 'როიალ ჰოტელი', 'როიალ პალასი')::jsonb,
    "draft" = replace(replace(replace("draft"::text, 'Royale Hotel', 'Royal Palace'), 'Royale Palace', 'Royal Palace'), 'როიალ ჰოტელი', 'როიალ პალასი')::jsonb,
    "seoTitle" = replace(replace(replace("seoTitle"::text, 'Royale Hotel', 'Royal Palace'), 'Royale Palace', 'Royal Palace'), 'როიალ ჰოტელი', 'როიალ პალასი')::jsonb,
    "seoDescription" = replace(replace(replace("seoDescription"::text, 'Royale Hotel', 'Royal Palace'), 'Royale Palace', 'Royal Palace'), 'როიალ ჰოტელი', 'როიალ პალასი')::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE concat("sections"::text, "draft"::text, "seoTitle"::text, "seoDescription"::text) ~ 'Royale (Hotel|Palace)|როიალ ჰოტელი';

-- The suite: its name, texts and address (/rooms/royal-suite; the old address redirects, see next.config.ts)
UPDATE "RoomType"
SET "name" = replace(replace("name"::text, 'Royale Suite', 'Royal Suite'), 'Люкс Royale', 'Люкс Royal')::jsonb,
    "shortDescription" = replace(replace("shortDescription"::text, 'Royale Suite', 'Royal Suite'), 'Люкс Royale', 'Люкс Royal')::jsonb,
    "description" = replace(replace("description"::text, 'Royale Suite', 'Royal Suite'), 'Люкс Royale', 'Люкс Royal')::jsonb
WHERE concat("name"::text, "shortDescription"::text, "description"::text) ~ 'Royale';
UPDATE "RoomType" SET "slug" = 'royal-suite'
WHERE "slug" = 'royale-suite' AND NOT EXISTS (SELECT 1 FROM "RoomType" WHERE "slug" = 'royal-suite');

-- Placeholder address of guests booked without an e-mail (must match NO_EMAIL in the code)
UPDATE "Guest" SET "email" = replace("email", '@guests.royalehotel.local', '@guests.royalpalacehotel.local')
WHERE "email" LIKE '%@guests.royalehotel.local';

-- Admin logins on the old placeholder domain
UPDATE "User" u SET "email" = replace(u."email", '@royalehotel.ge', '@royalpalacehotel.ge')
WHERE u."email" LIKE '%@royalehotel.ge'
  AND NOT EXISTS (SELECT 1 FROM "User" o WHERE o."email" = replace(u."email", '@royalehotel.ge', '@royalpalacehotel.ge'));
