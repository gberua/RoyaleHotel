# Royale Hotel — Kobuleti

Direct-booking website, booking engine and staff admin panel for Royale Hotel, Kobuleti, Georgia.
Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 7 · next-intl · Auth.js ·
zod · sharp · pdf-lib · Resend (e-mail) · Vitest + Playwright.

Languages: **Georgian (default, `/`)**, English (`/en`), Russian (`/ru`). Hebrew (RTL), Turkish and Armenian are
pre-registered in `src/i18n/locales.ts` and can be switched on there.

## Status

| Phase | Scope | State |
|---|---|---|
| a | Design system + all public pages | ✅ done |
| b | Booking engine (availability, pricing, extras, holds, payments, emails, manage booking, admin bookings, iCal) | ✅ done |
| c1 | Admin core: rooms & rates, media library, staff & roles, settings, website content (KA/EN/RU) | ✅ done |
| c2 | Daily operations: dashboard, housekeeping, calendar drag & drop, booking helpers, automatic e-mails | |
| c3 | Guests & insights: reviews, guest CRM, reports | |
| d | Payments (TBC / BOG adapters — need merchant keys), emails + PDF voucher, Telegram | ✅ built, needs credentials |
| e | SEO polish, Lighthouse, tests | |

## Quick start (local)

Requirements: Node 20+ (tested on 24), PostgreSQL 15+ (tested on 17).

```bash
cp .env.example .env          # then edit DATABASE_URL, AUTH_SECRET, owner email/password
npm install                   # also generates the Prisma client
npx prisma migrate deploy     # creates tables + the no-double-booking constraint
npm run db:seed               # starting rooms, prices, content + owner account
npm run demo:photos           # licensed DEMO photos (assets/demo) → media library + links them to the site
npm run dev                   # http://localhost:3000   (admin: /admin)
```

The seed is idempotent: run it again any time; it never overwrites what staff edited.

## Environment variables

Every variable is documented in `.env.example`. Minimum to run: `DATABASE_URL`, `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL` (the public domain — used for canonical URLs, hreflang, sitemap and OpenGraph).

## Photos (Google Maps → website)

1. Put the photos in `assets/google-maps/` (sub-folders such as `pool/`, `room/`, `exterior/` become categories).
2. Run `npm run images`. Every photo is auto-rotated, stripped of EXIF/GPS, resized (max 2560 px), saved as
   WebP + AVIF with a blur placeholder, and added to the media library. Re-running skips already-imported photos.
3. Optional bulk naming/sorting: `assets/google-maps/catalog.json` (format at the top of `scripts/import-images.ts`)
   — assign a photo to a room type, put it in the hero, or `"skip": true` for photos that show the old hotel name.

Photos are managed in **Admin → Media library** (upload, order, alt text, replace). Licensed DEMO photos are marked there until the hotel's own photos replace them.

## Demo photos (until the real hotel photos arrive)

All image slots are filled with licensed Unsplash / Pexels photos listed in `assets/demo/demo-photos.json`
(credits in `CREDITS.md`). `npm run demo:photos` downloads, optimizes and links them; `npm run demo:hero` does the hero.
Each one is flagged **DEMO – replace with real hotel photo** in **/admin/media** (toggle *Demo images only*).

## Admin

`/admin` — sign in with the owner account from the seed (`SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` in `.env`;
**change the password before going live** under *My account*). The admin speaks Georgian, English or Russian — each
person picks their own language (My account; the login screen has a switch too).

| Area | Where | Notes |
|---|---|---|
| Room types & room numbers | Rooms | archive instead of delete when bookings exist; block a room for repairs |
| Prices | Rate calendar · Seasons · Extras & children · Promo codes | drag over dates → preview old → new → apply; changes affect **new** bookings only |
| Photos | Media library | drag-drop many files (auto WebP + AVIF), order per room / gallery, alt text ×3, cover, Replace, DEMO filter |
| Texts & SEO | Website content | drafts → *Preview* (shows the real site with your draft) → *Publish* |
| Staff | Staff (owner only) | roles: Owner · Manager · Receptionist · Housekeeping; e-mail invite or one-time password; 5 wrong passwords lock an account for 15 min |
| Hotel facts, booking rules, payments, alerts, currencies | Settings (owner only) | optional daily exchange-rate update from the National Bank of Georgia |
| Who changed what | Activity log | old → new values for prices, rooms, settings, bookings; failed logins with IP |

Role checks happen on the server for every page and action (`src/lib/permissions.ts`), not just by hiding buttons.

## Fonts

All font settings live in **`src/config/fonts.ts`**.

- Headings: **Noto Serif Georgian** pinned to 72 % width (free, SIL OFL) — the closest licensed match to the reference
  (tall, condensed, high-contrast) — paired with **Noto Serif Display** (same design) for Latin/Cyrillic.
- Body: **Noto Sans Georgian + Noto Sans** (Latin, Cyrillic).
- To install the licensed display face (e.g. Narcissus): drop its `.woff2` files into `public/fonts/display/` and
  restart/rebuild. It is applied to Georgian characters automatically (weights are read from the file names).

Fonts are self-hosted static subsets (~15–22 KB each), built by `scripts/build-fonts.py`.

## Starting content to review before launch

The seed gives the admin realistic starting content — review it in the admin panel: room types, sizes and prices ·
seasons · extras and child prices · offers · policies (have a lawyer review the privacy policy) · beach distance ·
FAQ answers · currency rates (or switch on the daily NBG update) · DEMO photos (Media library → “Show DEMO photos only”) ·
Telegram username (button hidden until set) · Instagram/Facebook links.

## Deploy

**VPS / Docker** (simplest with local media storage): `npm ci && npx prisma migrate deploy && npm run build && npm start`
behind Nginx/Caddy with HTTPS. Media lives in `./storage/media` — back it up together with the database.

**Vercel** (live: https://royale-hotel-eta.vercel.app) — Hobby plan, functions in Frankfurt (`fra1`):
- Database: Neon (Vercel Marketplace, Frankfurt) → `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are set by the integration.
- Photos: Vercel Blob store (public) → `STORAGE_DRIVER=blob` + `BLOB_READ_WRITE_TOKEN`.
- Build command `node scripts/vercel-build.mjs` (vercel.json): runs migrations on every deploy. The first deploy ran with
  `SETUP_DATA=1` (seed + DEMO photos to Blob + pay-at-hotel only); that flag was removed afterwards — never set it again on a live site.
- Background job: once a day on Hobby (`vercel.json` cron). Expired holds are also released on every booking search.
- Online payments are off until TBC / Bank of Georgia keys are added (then Admin → Settings → Payment options).
- E-mails need `RESEND_API_KEY` (and a verified sending domain) — without it no e-mail is sent on Vercel.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build && npm start` | production build / server |
| `npm run db:seed` | add missing placeholder data |
| `npm run images` | import photos from `assets/google-maps/` |
| `npm run demo:photos` | (re)import the licensed demo photos |
| `npm run db:studio` | browse the database |
| `npm run typecheck` / `npm run lint` | checks |

## Project map

```
prisma/schema.prisma        data model (localized JSON fields, money in tetri, no-overlap EXCLUDE constraint)
prisma/seed.ts              starting content (room types, prices, policies) to adjust in the admin
src/app/[locale]/…          public pages (home, rooms, rooms/[slug], gallery, amenities, offers, kobuleti,
                            reviews, contact, faq, policies/[slug], book, booking/manage)
src/app/media/[...path]     serves locally stored media
src/lib/data.ts             cached read layer (tags → instant updates from admin)
src/lib/settings-schema.ts  every hotel setting, with defaults
src/i18n/locales.ts         language registry (the only place to add a language)
messages/{ka,en,ru}.json    interface text · page content itself is edited in the admin
scripts/import-images.ts    photo pipeline · scripts/fonts.mjs — custom display-font loader
```

## Booking system — how it works

- **Inventory** = physical rooms (numbers) grouped into room types. A type is bookable when at least one of its rooms is
  free for every night (the check-out day is not a night). Closed dates, minimum stay, max guests and rooms marked
  *out of order* are respected. Dates are Asia/Tbilisi; same-day online bookings close at the cutoff (Settings → booking).
- **Price per night** = base → seasonal rate → weekend price (Fri/Sat) → date override (final). Plus extra adults /
  children by age (above the room's included guests), extras, promo code (% or fixed, date windows, usage limit),
  city tax if set. The server always recalculates; the browser only displays.
- **No double bookings**: checkout places a 15-minute HOLD on a specific room; confirmation runs in a locked database
  transaction; a PostgreSQL EXCLUDE constraint makes overlapping stays in one room physically impossible.
  Unpaid pending bookings expire automatically and release the room.
- **Statuses**: pending (awaiting payment) → confirmed → checked in → checked out; plus cancelled, no-show, expired.
- **Payments** (`src/lib/payments/`): one adapter interface. *Pay at hotel*, *deposit* and *full prepayment*.
  `mock` provider for testing (success / decline / cancel page); **TBC Checkout** and **Bank of Georgia** adapters are
  implemented and switch on when their keys are in `.env` and `paymentProvider` is set to `tbc` / `bog`.
  Callbacks never trust the request body — the status is always re-read from the bank.
- **After booking**: guest email (in their language) with PDF voucher; hotel email + Telegram alert. Without
  `RESEND_API_KEY`, emails are saved to `storage/outbox/` so nothing is lost.
- **Channel sync**: Admin → Channels. Per room type, an iCal export URL for Booking.com / Airbnb / Expedia and an
  import URL from them. Background sync every 15 minutes (`ENABLE_INTERNAL_CRON=true` on a VPS, or `vercel.json` cron
  with `CRON_SECRET` on Vercel).

## Make a test booking yourself

1. `npm run dev`, open http://localhost:3000 → **Book** (or any room's *Book* button).
2. Pick dates and guests → **Add** a room (add several for a multi-room booking) → *Continue*.
3. Choose extras → enter your details → on the review step try promo code **EARLY10** (summer 2027, 3+ nights).
4. *Pay at the hotel* confirms instantly. *Deposit* / *Pay in full* opens the **test payment page**: choose
   success, decline or cancel. No real money is involved.
5. You get the booking code (RH-2026-0001…) and a PDF voucher; the email is in `storage/outbox/`.
6. **Manage booking** (footer or menu): enter the code + email to view, download the voucher, or cancel
   (the refund is calculated by the cancellation policy and shown before you confirm).

## See it in the admin

http://localhost:3000/admin — sign in with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` from `.env`.

- **Bookings**: list with filters + CSV export (opens in Excel); click a code for the booking page: confirm, check
  in / out, no-show, record a payment, move to another room, change dates (re-priced), cancel with refund, notes.
- **Calendar**: rooms × dates timeline, coloured by status (incl. holds and Booking.com/Airbnb blocks); refreshes itself.
- **New booking**: phone / walk-in / WhatsApp bookings through the same availability + pricing engine.
- **Channels** (iCal), **Media**, **Activity** (who changed what).

## Tests

```bash
npm test            # unit + integration (needs the royale_hotel_test database, see below)
npm run test:e2e    # Playwright: full guest journey + admin, desktop and mobile (dev server must be running or will be started)
```
Integration tests use a separate database: `createdb royale_hotel_test && DATABASE_URL=…/royale_hotel_test npx prisma migrate deploy`.

## Before going live — checklist

- **Real room data**: room types, room numbers, prices, seasons, extras, child prices, policies (all marked PLACEHOLDER).
- **Payments**: merchant accounts with TBC and/or Bank of Georgia → put the keys in `.env`, set
  `booking.paymentProvider` to `tbc` or `bog`, run one real low-value test payment, then refund it.
  Register `https://<domain>/api/payments/tbc/callback` (or `/bog/callback`) as the callback URL in the bank portal.
- **Email**: verify the domain in Resend (SPF/DKIM DNS records), set `RESEND_API_KEY` and `EMAIL_FROM`.
- **Telegram**: create a bot with @BotFather → `TELEGRAM_BOT_TOKEN`; add it to the staff group →
  `TELEGRAM_CHAT_ID`.
- **Hotel notification emails**: Settings → notifications.adminEmails.
- **Domain**: `NEXT_PUBLIC_SITE_URL`, a strong `AUTH_SECRET`, `CRON_SECRET`; change the owner password.
- **Channels**: paste the Booking.com / Airbnb iCal URLs in Admin → Channels and give them our export URLs.
- Keep `PAYMENTS_ALLOW_MOCK` unset in production (the test payment page is then disabled).

## Staff guide

The admin panel (`/admin`) arrives in phase (c); this section will then describe daily use for each role
(Owner, Manager, Receptionist, Housekeeping).
