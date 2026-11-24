# Real hotel photos: design (job 1 of 2)

Date: 2026-11-22 · Status: awaiting approval

## Why

Every image on the site is a demo stock photo (Unsplash/Pexels, listed in `CREDITS.md`). The hotel sent its real photos over WeTransfer: 93 files, extracted to `C:\Users\User\Downloads\royal-palace-pictures` in three folders (`palasi 3`, `palasi2`, `royal palace`). The site should show the actual Royal Palace.

## Goals

- Use a real photo everywhere one exists:
  - home hero and CTA
  - building, pool, balconies and views, Kobuleti aerials
  - the gallery
  - the Standard Double room page
  - the pool and beach services
  - both offers
- The gallery shows real photos only.
- Every new photo has alt text in Georgian, English and Russian.
- Preview everything on the local site first. The same list then runs against the live site.

## Non-goals

- Rebuilding the room list. That is job 2, next: 59 rooms, made up of 43 two-person, 6 three-person and 10 four-person rooms, including the family "2+2" rooms and one apartment. Room types other than Standard Double keep their stock photos until then.
- Moving production to Supabase. The user is setting that up on 2026-11-23.
- Changing page layouts or design.

## Anti-goals

- Nothing that would mislead a guest:
  - no rendered image passed off as the lobby
  - no banner with text baked in
  - no stock room photo next to real ones on the same page
- Never commit the original photos (about 45 MB) to git.

## Constraints

- **The files are 1500 px wide**, because they are web exports. That is fine everywhere except the full-screen hero on large screens, where they look a little soft.
  - Ask the photographer for the full-size originals of the hero and CTA picks.
  - When they arrive, swap them in with Admin → Media → Replace. Replace keeps every slot assignment.
- **Photo records belong to one environment.** Locally they point at `/media/...`; on the live site they point at Blob URLs. So the live import has to run against the live database and storage.
- **Scripts don't refresh cached pages.** Restart the local dev server after an import. On the live site, any admin media action or a redeploy refreshes them.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | Import with `scripts/import-images.ts` and a catalog. The catalog gives each file its category, alt text in 3 languages, gallery position, room and slot. | Fastest. Can be previewed locally. Repeatable for job 2. Needs a small script fix plus live credentials. |
| B | Upload by hand in the live admin | No code. Hours of manual entry, and no preview. |
| C | Import locally for review, then upload by hand in the live admin | Preview without live keys. Keeps all of B's manual work. |

The user picked A.

## Photo plan

Where the `royal palace` folder has an edited version of a shot (brighter or cropped), use it instead of the raw file. Those are marked (e) below.

| Slot or category | Photos |
|---|---|
| **Hero** | `DJI_20261117141720_0803_D`: the hotel tower in town, snow-capped mountains behind |
| **CTA** | `DJI_20261117141856_0810_D`: coastline, sea, town, mountains |
| exterior | `0L9A7013` (front entrance with RP logo), `0L9A7010`, `0L9A7005`, `DJI_…_0799` (hotel beside the park, from above), `DJI_…_0815` |
| pool | `0L9A7291` (e), `0L9A7290`, `0L9A6879` (pool seen from an upper balcony) |
| view | `0L9A6958` (e), `0L9A6965`, `0L9A6773` |
| beach | `DJI_…_0810` |
| kobuleti | `DJI_…_0796` (mountains), `DJI_…_0813`, `DJI_…_0803` |
| room (Standard Double page, cover first) | `0L9A7173` (e), `0L9A6946` (e), `0L9A7176` (e), `0L9A7147` (e), `0L9A7152`, `0L9A7139`, `0L9A7156` (e, bathroom), `0L9A7264` (e, wardrobe), `0L9A6749` (robe with logo) |
| room (gallery only, until job 2) | 3-person: `0L9A7245` (e), `0L9A7241`, `0L9A7249`. Three single beds: `0L9A6747`, `0L9A6757`. Second bathroom style: `0L9A7215`. Room 807 doorway: `0L9A7135` |
| pool service · beach service | `0L9A7291` (e) · `DJI_…_0810` |
| early-summer offer · family-summer offer | `0L9A7290` · `0L9A6958` (e) |

That is about 30 photos.

**Left out:**
- about 60 near-duplicate frames
- `IMG_5131.jpg`, an ad banner with text on it
- the lobby image `F83275D4-….PNG`, which looks rendered. Add it if the hotel confirms it's a real photo.

**Stays stock for now:**
- the restaurant service photo, because the only real restaurant picture is the sign on the building
- the 7 Kobuleti attractions. These show real places and are credited, which is fine.
- room types other than Standard Double, until job 2

**Rules:**
- Demo photos leave the gallery.
- Wherever the site picks "the first photo of category X" (page header bands, the menu), a real photo wins over a stock one.
- Standard Double shows only real photos.

## Live site

The live import runs after Supabase is set up. What Supabase replaces decides how:

- **Database only (replacing Neon):** run the same catalog against the Supabase database, with photos still in Vercel Blob.
- **Photo storage too (replacing Vercel Blob):** the site has no Supabase storage support yet, only local disk and Vercel Blob. That support has to be built first, as its own job.

## Left to the builder

- Fix the Windows path bug in the import script. Today it builds the category from `rel.split("/")`, so folder names are ignored on Windows.
- Set the hero and CTA slots explicitly. The script's `hero` flag adds to the end of the list instead of replacing the first entry.
- Detach the demo photos from Standard Double. The script appends room photos, so a demo cover would stay first.
- Take the demo photos out of the gallery.
- Make real photos sort before demo ones in `getMediaByCategory`, which today orders by `galleryOrder` only.
- Decide how the service and offer photos get set.
- Choose the gallery order and the exact alt text wording.
- Keep the source photos outside git, either by reading them from the Downloads folder or by gitignoring the source folder.
